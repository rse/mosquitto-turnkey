/*
**  Mosquitto -- Mosquitto MQTT Broker Turnkey Solution
**  Copyright (c) 2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
*/

/*  built-in dependencies  */
import fs                     from "node:fs"
import path                   from "node:path"
import os                     from "node:os"
import { EventEmitter }       from "node:events"

/*  external dependencies  */
import { execa }              from "execa"
import type { ResultPromise } from "execa"
import which                  from "which"
import tmp                    from "tmp"
import textframe              from "textframe"
import selfsigned             from "selfsigned"

/*  Mosquitto configuration types  */
export type MosquittoConfigPasswdEntry = {
    username:    string,
    password:    string
}
export type MosquittoConfigListenEntry = {
    protocol:    "mqtt" | "mqtts" | "ws" | "wss"
    name?:       string
    address:     string
    port:        number
}
export type MosquittoConfig = {
    native:       boolean
    container:    string
    auth:         "builtin" | "plugin"
    persistence:  boolean
    acl:          string
    passwd:       MosquittoConfigPasswdEntry[]
    listen:       MosquittoConfigListenEntry[]
    custom:       string
}

/*  Mosquitto API class  */
export default class Mosquitto extends EventEmitter {
    private config:  MosquittoConfig
    private tmpdir:  { path: string, cleanup: () => void } | null = null
    private started                                               = false
    private process: ResultPromise | null                         = null
    private output                                                = ""

    /*  construct API  */
    constructor (config: Partial<MosquittoConfig> = {}) {
        super()
        this.config = {
            native:       false,
            container:    "ghcr.io/rse/mosquitto:2.0.22-20260117",
            auth:         "builtin",
            acl:          "",
            persistence:  false,
            passwd:       [ { username: "example", password: "example" } ],
            listen:       [ { protocol: "mqtt", address: "127.0.0.1", port: 1883 } ],
            custom:       "",
            ...config
        }
    }

    /*  start Mosquitto  */
    async start () {
        /*  sanity check state  */
        if (this.started)
            throw new Error("already started")

        /*  determine current user information  */
        const ui  = os.userInfo()
        const uid = ui.uid.toString()
        const gid = ui.gid.toString()

        /*  ensure Mosquitto exists  */
        const ensureProgram = async (name: string) => {
            const exists = await which(name).then(() => true).catch(() => false)
            if (!exists)
                throw new Error(`program "${name}" not found`)
        }
        if (this.config.native) {
            await ensureProgram("mosquitto")
            await ensureProgram("mosquitto_passwd")
        }
        else
            await ensureProgram("docker")

        /*  create temporary directory  */
        this.tmpdir = await new Promise((resolve, reject) => {
            tmp.dir({
                mode:          0o750,
                prefix:        "mosquitto-",
                unsafeCleanup: true
            }, (err, path, cleanupCallback) => {
                if (err)
                    reject(err)
                else
                    resolve({ path, cleanup: cleanupCallback })
            })
        })
        const tmpdir = this.tmpdir!.path

        /*  generate Mosquitto configuration: standard prolog  */
        let conf = textframe(`
            #   logging
            log_dest                stderr
            log_type                error
            log_type                warning
            log_type                notice
            log_type                information
            log_type                subscribe
            log_type                unsubscribe
            log_type                websockets
            log_type                debug
            websockets_log_level    2
            connection_messages     true
            log_timestamp           true
            log_timestamp_format    [%Y-%m-%d %H:%M:%S]

            #   internals
            sys_interval            1
            websockets_headers_size 2048
        `)

        /*  generate Mosquitto configuration: authentication and authorization  */
        if (this.config.auth === "builtin") {
            conf += textframe(`
                #   security (built-in)
                acl_file         ./mosquitto-acl.txt
                password_file    ./mosquitto-pwd.txt
                allow_anonymous  true
            `)
        }
        else if (this.config.auth === "plugin") {
            conf += textframe(`
                #   security (plugin-based)
                plugin                       /app/libexec/mosquitto-go-auth.so
                auth_opt_backends            files
                auth_opt_files_password_path ./mosquitto-pwd.txt
                auth_opt_files_acl_path      ./mosquitto-acl.txt
                auth_opt_allow_anonymous     true
            `)
        }
        else
            throw new Error("invalid auth type")

        /*  generate Mosquitto configuration: persistence  */
        if (this.config.persistence) {
            conf += textframe(`
                #   persistence
                persistence          true
                persistence_location /app/var/mosquitto.d/
                persistence_file     mosquitto.db
                autosave_interval    1800
                autosave_on_changes  false
            `)
        }
        else {
            conf += textframe(`
                #   persistence
                persistence          false
                autosave_on_changes  false
            `)
        }

        /*  generate Mosquitto configuration: custom aspects  */
        if (this.config.custom !== "")
            conf += this.config.custom

        /*  generate Mosquitto configuration: listeners  */
        let requireTLS = false
        for (const entry of this.config.listen) {
            conf += textframe(`
                #   listener for "${entry.protocol}"
                listener         ${entry.port} ${this.config.native ? entry.address : "0.0.0.0"}
                max_connections  -1
                set_tcp_nodelay  true
            `)
            if (entry.protocol.match(/^mqtts?$/)) {
                conf += textframe(`
                    protocol mqtt
                `)
            }
            else if (entry.protocol.match(/^wss?$/)) {
                conf += textframe(`
                    protocol websockets
                `)
            }
            if (entry.protocol === "mqtts" || entry.protocol === "wss") {
                requireTLS = true
                conf += textframe(`
                    certfile            ./mosquitto-crt.pem
                    keyfile             ./mosquitto-key.pem
                    require_certificate false
                `)
            }
        }

        /*  determine exposed ports  */
        const exposeOptions = []
        for (const entry of this.config.listen)
            exposeOptions.push("-p", `${entry.address}:${entry.port}:${entry.port}`)

        /*  write Mosquitto configuration  */
        const confFile = path.join(tmpdir, "mosquitto.conf")
        await fs.promises.writeFile(confFile, conf, { encoding: "utf8", mode: 0o600 })

        /*  generate Mosquitto ACL file  */
        const aclFile = path.join(tmpdir, "mosquitto-acl.txt")
        let acl = ""
        if (this.config.acl !== "")
            acl = this.config.acl
        else {
            acl = textframe(`
                #   shared/anonymous ACL list
                topic   read       $SYS/#
                pattern write      $SYS/broker/connection/%c/state
                pattern read       peer/%c
            `)
            for (const entry of this.config.passwd) {
                acl += textframe(`
                    #   user ACL list
                    user    ${entry.username}
                    topic   readwrite  ${entry.username}/#
                    topic   read       ${entry.username}/$share/#
                    topic   write      peer/#
                `)
            }
        }
        await fs.promises.writeFile(aclFile, acl, { encoding: "utf8", mode: 0o600 })

        /*  generate Mosquitto password file  */
        const passwdFile = path.join(tmpdir, "mosquitto-pwd.txt")
        await fs.promises.writeFile(passwdFile, "", { encoding: "utf8", mode: 0o600 })
        for (let i = 0; i < this.config.passwd.length; i++) {
            const entry = this.config.passwd[i]
            if (this.config.native) {
                await execa("mosquitto_passwd", [
                    "-H", "sha512-pbkdf2", "-b",
                    ...(i === 0 ? [ "-c" ] : []),
                    passwdFile, entry.username, entry.password
                ], {
                    stdio: [ "ignore", "ignore", "ignore" ]
                })
            }
            else {
                await execa("docker", [
                    "run",
                    "--rm",
                    "--name", "mosquitto-passwd",
                    "-v", `${tmpdir}:/mosquitto`,
                    "-e", "MOSQUITTO_ETCDIR=/mosquitto",
                    "-e", "MOSQUITTO_VARDIR=/mosquitto",
                    "-e", `MOSQUITTO_UID=${uid}`,
                    "-e", `MOSQUITTO_GID=${gid}`,
                    this.config.container,
                    "mosquitto_passwd",
                    "-H", "sha512-pbkdf2",
                    "-b",
                    ...(i === 0 ? [ "-c" ] : []),
                    "/mosquitto/mosquitto-pwd.txt",
                    entry.username,
                    entry.password
                ], {
                    stdio: [ "ignore", "ignore", "ignore" ]
                })
            }
        }

        /*  generate Mosquitto TLS certificate/key pair  */
        if (requireTLS) {
            const attributes = this.config.listen
                .filter((entry) => entry.name !== undefined)
                .map((entry) => ({ name: "commonName" as const, value: entry.name! }))
            const result = await selfsigned.generate(attributes.length > 0 ? attributes : undefined, {})
            const crtFile = path.join(tmpdir, "mosquitto-crt.pem")
            await fs.promises.writeFile(crtFile, result.cert, { encoding: "utf8", mode: 0o600 })
            const keyFile = path.join(tmpdir, "mosquitto-key.pem")
            await fs.promises.writeFile(keyFile, result.private, { encoding: "utf8", mode: 0o600 })
        }

        /*  start Mosquitto process  */
        if (this.config.native) {
            this.process = execa("mosquitto", [ "-c", confFile ], {
                cwd:      tmpdir,
                stdio:    [ "ignore", "pipe", "pipe" ],
                encoding: "utf8",
                buffer:   false
            })
        }
        else {
            this.process = execa("docker", [
                "run",
                "--rm",
                "--name", "mosquitto",
                "-v", `${tmpdir}:/mosquitto`,
                "-e", "MOSQUITTO_ETCDIR=/mosquitto",
                "-e", "MOSQUITTO_VARDIR=/mosquitto",
                "-e", `MOSQUITTO_UID=${uid}`,
                "-e", `MOSQUITTO_GID=${gid}`,
                ...exposeOptions,
                this.config.container
            ], {
                cwd:      tmpdir,
                stdio:    [ "ignore", "pipe", "pipe" ],
                encoding: "utf8",
                buffer:   false
            })
        }

        /*  avoid unhandled rejection warnings on stop()  */
        this.process.catch(() => {})

        /*  capture outputs of the Mosquitto process  */
        this.process.stdout?.setEncoding("utf8")
        this.process.stderr?.setEncoding("utf8")
        this.process.stdout?.on("data", (data: string) => {
            this.emit("stdout", data)
            this.output += data
        })
        this.process.stderr?.on("data", (data: string) => {
            this.emit("stderr", data)
            this.output += data
        })

        /*  wait until Mosquitto is running inside container  */
        let timeout:  ReturnType<typeof setTimeout>  | null = null
        let interval: ReturnType<typeof setInterval> | null = null
        const cleanup = () => {
             if (timeout  !== null) { clearTimeout(timeout);   timeout  = null }
             if (interval !== null) { clearInterval(interval); interval = null }
        }
        await Promise.any([
             /*  timeout handling  */
             new Promise<void>((resolve, reject) => {
                 timeout = setTimeout(() => {
                     cleanup()
                     reject(new Error("timeout starting Mosquitto"))
                 }, 10 * 1000)
             }),

             /*  output handling  */
             new Promise<void>((resolve, reject) => {
                 interval = setInterval(() => {
                     if (this.output.match(/mosquitto version [0-9.]+ running/s)) {
                         cleanup()
                         resolve()
                     }
                 }, 50)
             })
        ])

        /*  update state  */
        this.started = true
    }

    /*  retrieve Mosquitto log output  */
    logs () {
        return this.output
    }

    /*  stop Mosquitto  */
    async stop () {
        /*  sanity check state  */
        if (!this.started)
            throw new Error("still not started")

        /*  stop Mosquitto process  */
        this.process?.kill("SIGTERM")
        const timeout = setTimeout(() => { this.process?.kill("SIGKILL") }, 5 * 1000)
        await this.process?.catch(() => {})
        clearTimeout(timeout)

        /*  destroy stdio pipe streams  */
        this.process?.stdout?.destroy()
        this.process?.stderr?.destroy()

        /*  remove temporary directory  */
        this.tmpdir?.cleanup()

        /*  update state  */
        this.started = false
    }
}

