##
##  Dockerfile -- Docker Build Configuration
##

#   build arguments (early)
ARG         IMAGE_PREFIX=ghcr.io/rse/
ARG         IMAGE_NAME=mosquitto
ARG         IMAGE_VERSION=2.0.22
ARG         IMAGE_RELEASE=20260117
ARG         IMAGE_ALIAS=latest

#   ==== STAGE 1 ====

#   derive image from a certain base image
FROM        golang:1.25.6-trixie AS stage1

#   add additional build tools
RUN         apt-get update && \
            apt-get upgrade -y && \
            apt-get install -y curl binutils binutils-gold gcc g++ cmake make xsltproc git patch && \
            apt-get install -y libc6-dev libssl-dev libc-ares-dev uthash-dev zlib1g-dev linux-libc-dev

#   create build environment
WORKDIR     /tmp/build

#   build cJSON
ENV         VERSION_CJSON=1.7.19
RUN         curl -sSkL https://github.com/DaveGamble/cJSON/archive/refs/tags/v${VERSION_CJSON}.tar.gz | \
                tar zxf -
RUN         cd cJSON-${VERSION_CJSON} && \
            cmake \
                -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
                -DCMAKE_BUILD_TYPE="Release" \
                -DCMAKE_INSTALL_PREFIX="/app" \
                -DCMAKE_C_FLAGS="-Wno-deprecated-declarations" \
                -DBUILD_SHARED_LIBS=OFF \
                . && \
            make && \
            make install

#   build libwebsockets
ENV         VERSION_LIBWEBSOCKETS=4.5.2
RUN         curl -sSkL https://github.com/warmcat/libwebsockets/archive/v${VERSION_LIBWEBSOCKETS}.tar.gz | \
                tar zxf -
RUN         cd libwebsockets-${VERSION_LIBWEBSOCKETS} && \
            cmake \
                -DCMAKE_BUILD_TYPE="Release" \
                -DCMAKE_INSTALL_PREFIX="/app" \
                -DCMAKE_C_FLAGS="-Wno-deprecated-declarations" \
                -DBUILD_SHARED_LIBS=OFF \
                -DLWS_IPV6=ON \
                -DLWS_WITHOUT_BUILTIN_GETIFADDRS=ON \
                -DLWS_WITH_SHARED=OFF \
                -DLWS_WITH_STATIC=ON \
                -DLWS_WITH_SSL=ON \
                -DLWS_WITH_ZLIB=ON \
                -DLWS_WITH_HTTP2=ON \
                -DLWS_WITH_LIBEV=OFF \
                -DLWS_WITH_LIBUV=OFF \
                -DLWS_WITH_EXTERNAL_POLL=ON \
                -DLWS_WITHOUT_CLIENT=ON \
                -DLWS_WITHOUT_TESTAPPS=ON \
                -DLWS_WITHOUT_EXTENSIONS=OFF \
                -DDISABLE_WERROR=ON \
                . && \
            make && \
            make install

#   build Mosquitto
ENV         VERSION_MOSQUITTO=2.0.22
RUN         curl -sSkL https://mosquitto.org/files/source/mosquitto-${VERSION_MOSQUITTO}.tar.gz | \
                tar zxf -
COPY        mosquitto.patch .
RUN         cd mosquitto-${VERSION_MOSQUITTO} && \
            patch -p0 <../mosquitto.patch && \
            cmake \
                -DCMAKE_BUILD_TYPE="Release" \
                -DCMAKE_INSTALL_PREFIX="/app" \
                -DCMAKE_C_FLAGS="-Wno-deprecated-declarations -I/app/include" \
                -DCMAKE_CXX_FLAGS="-Wno-deprecated-declarations -I/app/include" \
                -DCMAKE_EXE_LINKER_FLAGS="-L/app/lib" \
                -DBUILD_SHARED_LIBS=OFF \
                -DWITH_STATIC_LIBRARIES=ON \
                -DSTATIC_WEBSOCKETS=ON \
                -DWITH_PIC=ON \
                -DWITH_ADNS=ON \
                -DWITH_WEBSOCKETS=ON \
                -DWITH_PLUGINS=ON \
                -DWITH_TLS=ON \
                -DWITH_TLS_PSK=ON \
                -DWITH_EC=ON \
                -DWITH_SRV=ON \
                . && \
            make && \
            make install && \
            mkdir -p /app/libexec && \
            cp -p plugins/*/mosquitto_*.so /app/libexec/ && \
            rm -rf /app/lib && \
            mv /app/sbin/mosquitto /app/bin/mosquitto

#   build Mosquitto authentication plugin
ENV         VERSION_PLUGIN=20ee931
RUN         git clone https://github.com/iegomez/mosquitto-go-auth && \
            cd mosquitto-go-auth && \
            git checkout -f "${VERSION_PLUGIN}"
RUN         cd mosquitto-go-auth && \
            env CGO_CFLAGS="-D_LARGEFILE64_SOURCE -fPIC -I`pwd`/../mosquitto-${VERSION_MOSQUITTO}/include" \
                CGO_LDFLAGS="-shared" \
                go build -v -buildmode=c-archive go-auth.go && \
            env CGO_CFLAGS="-D_LARGEFILE64_SOURCE -fPIC -I`pwd`/../mosquitto-${VERSION_MOSQUITTO}/include" \
                CGO_LDFLAGS="-shared" \
                go build -v -buildmode=c-shared -o go-auth.so && \
            env CGO_CFLAGS="-D_LARGEFILE64_SOURCE -fPIC -I`pwd`/../mosquitto-${VERSION_MOSQUITTO}/include" \
                CGO_LDFLAGS="" \
                go build -o pw pw-gen/pw.go && \
            mkdir -p /app/libexec && \
            cp -p go-auth.so /app/libexec/mosquitto-go-auth.so && \
            cp -p pw /app/bin/mosquitto_pw

#   ==== STAGE 2 ====

#   derive image from a certain base image
FROM        golang:1.25.6-trixie AS stage2

#   add additional build tools
RUN         apt-get update && \
            apt-get upgrade -y && \
            apt-get install -y curl git binutils

#   create build environment
ENV         GOPATH=/tmp/build
WORKDIR     /tmp/build

#   build SupervisorD
ENV         VERSION_SUPERVISORD=16cb640
RUN         git clone https://github.com/ochinchina/supervisord \
                $GOPATH/src/github.com/ochinchina/supervisord
RUN         (   cd $GOPATH/src/github.com/ochinchina/supervisord && \
                git checkout -f "${VERSION_SUPERVISORD}" && \
                go get -v -d && \
                go build -v -o /tmp/build/supervisord )
RUN         strip supervisord

#   ==== STAGE 3 ====

#   derive image from a certain base image
FROM        debian:trixie-slim

#   link to Github repository
LABEL       org.opencontainers.image.source=https://github.com/rse/mosquitto
LABEL       org.opencontainers.image.description="Mosquitto MQTT Broker Control"

#   prepare Debian
RUN         apt-get update && \
            apt-get upgrade -y

#   extend Debian
RUN         apt-get install -y --no-install-recommends bash curl gosu && \
            apt-get install -y --no-install-recommends libc6 libssl3 libc-ares2

#   establish application area and user/group
RUN         groupadd -g 2000 app
RUN         useradd -u 2000 -g app -d /app -m -s /bin/bash -p '!' -l app
RUN         mkdir -p -m 755 /app

#   establish application area
RUN         mkdir -p -m 755 /app/bin /app/etc /app/var /app/share

#   install Mosquitto
COPY        --from=stage1 /app/ /app/
RUN         chmod 755 /app
RUN         rm -rf /app/etc/mosquitto /app/share /app/include

#   install SupervisorD
COPY        --from=stage2 /tmp/build/supervisord /app/bin/supervisord
RUN         chmod 755 /app/bin/supervisord
COPY        supervisord.ini /app/etc/supervisord.ini

#   strip down binaries
RUN         apt-get install -y --no-install-recommends binutils
RUN         strip /app/bin/*
RUN         apt-get purge -y binutils && \
            apt-get autoremove -y

#   install configurations
COPY        mosquitto.conf    /app/etc/mosquitto.conf
COPY        mosquitto-acl.txt /app/etc/mosquitto-acl.txt
RUN         chmod 700         /app/etc/mosquitto-acl.txt
RUN         mkdir             /app/etc/mosquitto.d
RUN         chmod 700         /app/etc/mosquitto.d
RUN         mkdir             /app/var/mosquitto.db.d
RUN         chmod 700         /app/var/mosquitto.db.d

#   setup initial authentication database
RUN         cp /dev/null /app/var/mosquitto-pwd.txt && \
            chown app:app /app/var/mosquitto-pwd.txt && \
            chmod 600 /app/var/mosquitto-pwd.txt && \
            touch -d "@0" /app/var/mosquitto-pwd.txt

#   install run-command script
COPY        rc.sh /app/bin/rc
RUN         chmod 755 /app/bin/rc

#   extend environment
ENV         PATH=/app/bin:$PATH

#   cleanup Debian
RUN         apt-get clean && \
            rm -rf /var/lib/apt/lists/*

#   fixate ownerships
RUN         chown -R app:app /app

#   provide volume
VOLUME      [ "/app/var" ]

#   provide entrypoint
ENTRYPOINT  [ "/app/bin/rc" ]
CMD         [ "boot" ]

#   expose HTTP port
EXPOSE      1883 8883

