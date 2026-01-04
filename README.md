
Mosquitto Turnkey
=================

Mosquitto MQTT Broker Turnkey Solution

[![github (author stars)](https://img.shields.io/github/stars/rse?logo=github&label=author%20stars&color=%233377aa)](https://github.com/rse)
[![github (author followers)](https://img.shields.io/github/followers/rse?label=author%20followers&logo=github&color=%234477aa)](https://github.com/rse)

About
-----

**Mosquitto Turnkey** is the combination of an OCI Container
and a corresponding TypeScript API for use with Node.js,
for easily starting an instance of the MQTT broker
[Eclipse Mosquitto](https://mosquitto.org/).

Installation
------------

```shell
$ npm install mosquitto-turnkey
```

Usage
-----

```ts
import Mosquitto from "mosquitto-turnkey"
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

License
-------

Copyright &copy; 2026 [Dr. Ralf S. Engelschall](http://engelschall.com/)<br/>
Licensed under [MIT license](https://spdx.org/licenses/MIT)

