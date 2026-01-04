/*
**  Mosquitto -- Mosquitto MQTT Broker Control
**  Copyright (c) 2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Licensed under MIT license <https://spdx.org/licenses/MIT>
*/

/*  external dependencies  */
import { expect } from "chai"
import MQTT       from "mqtt"

/*  internal dependencies  */
import Mosquitto from "../dst/mosquitto.js"

/*  test suite  */
describe("Mosquitto Library", function () {
    it("TypeScript API sanity check", function () {
        /*  basic Mosquitto TypeScript API sanity check  */
        const mosquitto = new Mosquitto()
        expect(mosquitto).to.be.a("object")
        expect(mosquitto).to.respondTo("start")
        expect(mosquitto).to.respondTo("logs")
        expect(mosquitto).to.respondTo("stop")
    })
    it("Simple MQTT Broker Service", async function () {
        this.timeout(5000)

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
    })
})

