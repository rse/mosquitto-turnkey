
Mosquitto
=========

Mosquitto MQTT Broker Turnkey Solution

[![github (author stars)](https://img.shields.io/github/stars/rse?logo=github&label=author%20stars&color=%233377aa)](https://github.com/rse)
[![github (author followers)](https://img.shields.io/github/followers/rse?label=author%20followers&logo=github&color=%234477aa)](https://github.com/rse)

About
-----

This is a **Mosquitto** turnkey solution, i.e., the combination
of an OCI Container `ghcr.io/rse/mosquitto` and a corresponding
TypeScript/JavaScript API `mosquitto` for use with Node.js, for
easily starting an instance of the excellent MQTT broker [Eclipse
Mosquitto](https://mosquitto.org/). It was born from the need to have a
Mosquitto instance available from within Node.js on the macOS and Linux
platforms. The OCI container bundles the Mosquitto program in a portable
way. The TypeScript/JavaScript API allows convenient configuration and
run-time control of it.

Installation
------------

```shell
$ npm install mosquitto
```

Usage
-----

```ts
import Mosquitto from "mosquitto"
import MQTT      from "mqtt"

/*  start Mosquitto  */
const mosquitto = new Mosquitto()
await mosquitto.start()
await new Promise((resolve) => { setTimeout(resolve, 1000) })

/*  connect to Mosquitto  */
const mqtt = MQTT.connect("mqtt://127.0.0.1:1883", {})
await new Promise<void>((resolve, reject) => {
    mqtt.once("connect", ()    => { resolve() })
    mqtt.once("error",   (err) => { reject(err) })
})
mqtt.end()

/*  stop Mosquitto  */
await mosquitto.stop()
await new Promise((resolve) => { setTimeout(resolve, 1000) })
console.log(mosquitto.logs())
```

Configuration
-------------

### TypeScript/JavaScript API

The API class construction accepts an argument of type `MosquittoConfig`:

```ts
/*  Mosquitto configuration types  */
export type MosquittoConfigPasswdEntry = {
    username:     string,
    password:     string
}
export type MosquittoConfigListenEntry = {
    protocol:     "mqtt" | "mqtts" | "ws" | "wss"
    name?:        string
    address:      string
    port:         number
}
export type MosquittoConfig = {
    native:       boolean
    container:    string
    auth:         "builtin" | "plugin"
    persistence:  boolean
    passwd:       MosquittoConfigPasswdEntry[]
    listen:       MosquittoConfigListenEntry[]
    custom:       string
}
```

The internal default is:

```ts
{
    native:       false,
    container:    "ghcr.io/rse/mosquitto:<version>"
    auth:         "builtin",
    persistence:  false,
    passwd:       [ { username: "example", password: "example" } ],
    listen:       [ { protocol: "mqtt", address: "127.0.0.1", port: 1883 } ],
    custom:       ""
}
```

### OCI Container

The OCI Container accepts the following environment variables and their default values:

```sh
SUPERVISORD_ETCDIR="/app/etc"
SUPERVISORD_BINDIR="/app/bin"
SUPERVISORD_VARDIR="/app/var"
MOSQUITTO_ETCDIR="/app/etc"
MOSQUITTO_BINDIR="/app/bin"
MOSQUITTO_VARDIR="/app/var"
MOSQUITTO_UID="app"
MOSQUITTO_GID="app"
MOSQUITTO_ADMIN_USERNAME="admin"
MOSQUITTO_ADMIN_PASSWORD="admin"
MOSQUITTO_CUSTOM_USERNAME="example"
MOSQUITTO_CUSTOM_PASSWORD="example"
```

The OCI Container accepts the following commands:

```sh
# start container
$ docker run ghcr.io/rse/mosquitto

# run Mosquitto tools
$ docker run -i -t ghcr.io/rse/mosquitto mosquitto_{pub,sub,rr,passwd,pw}|passwd [...]

# backup/restore data of running container
$ docker exec -i ghcr.io/rse/mosquitto backup|restore [...]
```

License
-------

Copyright &copy; 2026 [Dr. Ralf S. Engelschall](http://engelschall.com/)<br/>
Licensed under [MIT license](https://spdx.org/licenses/MIT)

