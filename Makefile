##
##  Mosquitto-Turnkey -- Mosquitto MQTT Broker Turnkey Solution
##  Copyright (c) 2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
##  Licensed under MIT license <https://spdx.org/licenses/MIT>
##

NPM = npm

all: build

bootstrap:
	@if [ ! -d node_modules ]; then $(NPM) install; fi

lint: bootstrap
	@$(NPM) start lint

build: bootstrap
	@$(NPM) start build

test: bootstrap
	@$(NPM) start test

clean: bootstrap
	@$(NPM) start clean

distclean: bootstrap
	@$(NPM) start distclean

