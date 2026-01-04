#!/bin/bash
##
##  rc.sh -- Docker Image Run-Command Script
##

#   configuration and allow external overrides
SUPERVISORD_ETCDIR="${SUPERVISORD_ETCDIR-/app/etc}"
SUPERVISORD_BINDIR="${SUPERVISORD_BINDIR-/app/bin}"
SUPERVISORD_VARDIR="${SUPERVISORD_VARDIR-/app/var}"
MOSQUITTO_ETCDIR="${MOSQUITTO_ETCDIR-/app/etc}"
MOSQUITTO_BINDIR="${MOSQUITTO_BINDIR-/app/bin}"
MOSQUITTO_VARDIR="${MOSQUITTO_VARDIR-/app/var}"
MOSQUITTO_UID="${MOSQUITTO_UID-app}"
MOSQUITTO_GID="${MOSQUITTO_GID-app}"
MOSQUITTO_ADMIN_USERNAME="${MOSQUITTO_ADMIN_USERNAME-admin}"
MOSQUITTO_ADMIN_PASSWORD="${MOSQUITTO_ADMIN_PASSWORD-admin}"
MOSQUITTO_CUSTOM_USERNAME="${MOSQUITTO_CUSTOM_USERNAME-example}"
MOSQUITTO_CUSTOM_PASSWORD="${MOSQUITTO_CUSTOM_PASSWORD-example}"

#   establish sane environment
PATH="$MOSQUITTO_BINDIR:$PATH"

#   display verbose message
verbose () {
    echo "INFO[$(date '+%Y-%m-%dT%H:%M:%SZ')] rc: ### $*" 1>&2
}

#   handle fatal error
fatal () {
    echo "ERROR[$(date '+%Y-%m-%dT%H:%M:%SZ')] rc: *** FATAL ERROR: $*" 1>&2
    exit 1
}

#   determine root pid of process
rpid () {
    local pid=${1-$$}
    while true; do
        if [[ ! -d /proc/$pid ]]; then
            break
        fi
        local ppid=$(awk '/^PPid:/ { print $2; }' </proc/$pid/status)
        if [[ $ppid == "0" ]]; then
            echo $pid
            break
        fi
        pid=$ppid
    done
}

#   start and control SupervisorD daemon
supervisord () {
    if [[ $# -eq 0 ]]; then
        #   execute daemon
        exec $SUPERVISORD_BINDIR/supervisord \
            -c $SUPERVISORD_ETCDIR/supervisord.ini
    else
        #   control daemon
        command $SUPERVISORD_BINDIR/supervisord \
            ctl -s unix://$SUPERVISORD_VARDIR/supervisord.sock \
            ${1+"$@"} >/dev/null 2>&1
    fi
}

#   boot the Docker container (outside SupervisorD)
cmd_boot () {
    if [[ $(rpid) != "1" ]]; then
        fatal "command has to be executed in primary container process context"
    fi
    if [[ $MOSQUITTO_UID != "app" || $MOSQUITTO_GID != "app" ]]; then
        verbose "changing runtime environment"
        chown -R $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_VARDIR
    fi
    verbose "pass-through control to SupervisorD"
    supervisord
}

#   start the Mosquitto service (inside SupervisorD)
cmd_start () {
    if [[ $(rpid) != "1" ]]; then
        fatal "command has to be executed in primary container process context"
    fi

    #   pre-fill authentication database on initial startup
    pwdfile="$MOSQUITTO_VARDIR/mosquitto-pwd.txt"
    if [[ $(stat -c %Y $pwdfile) -eq 0 ]]; then
        verbose "activating administrator account \"$MOSQUITTO_ADMIN_USERNAME\""
        gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto_passwd \
            -b $pwdfile "$MOSQUITTO_ADMIN_USERNAME" "$MOSQUITTO_ADMIN_PASSWORD"
        if [[ $MOSQUITTO_CUSTOM_USERNAME != "" && $MOSQUITTO_CUSTOM_PASSWORD != "" ]]; then
            verbose "activating custom account \"$MOSQUITTO_CUSTOM_USERNAME\""
            gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto_passwd \
                -b $pwdfile "$MOSQUITTO_CUSTOM_USERNAME" "$MOSQUITTO_CUSTOM_PASSWORD"
        fi
    fi

    #   start Mosquitto service
    verbose "starting Mosquitto service"
    supervisord start mosquitto
}

#   backup state
cmd_backup () {
    if [[ $(rpid) == "1" ]]; then
        fatal "command has to be executed in secondary container process context"
    fi
    tar cf - -C $MOSQUITTO_VARDIR . | gzip -9
}

#   restore state
cmd_restore () {
    if [[ $(rpid) == "1" ]]; then
        fatal "command has to be executed in secondary container process context"
    fi
    mv $MOSQUITTO_VARDIR $MOSQUITTO_VARDIR.old
    mkdir $MOSQUITTO_VARDIR
    if gunzip - | tar xf - -C $MOSQUITTO_VARDIR; then
        rm -rf $MOSQUITTO_VARDIR.old
        kill 1
    else
        rm -rf $MOSQUITTO_VARDIR
        mv $MOSQUITTO_VARDIR.old $MOSQUITTO_VARDIR
        fatal "restore failed, original state preserved"
    fi
}

#   start Mosquitto
cmd_mosquitto () {
    if [[ $(rpid) != "1" ]]; then
        fatal "command has to be executed in primary container process context"
    fi
    cd $MOSQUITTO_ETCDIR || exit $?
    exec gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto -c ./mosquitto.conf
}

#   run mosquitto_pub(1) CLI
cmd_mosquitto_pub () {
    exec gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto_pub ${1+"$@"}
}

#   run mosquitto_sub(1) CLI
cmd_mosquitto_sub () {
    exec gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto_sub ${1+"$@"}
}

#   run mosquitto_rr(1) CLI
cmd_mosquitto_rr () {
    exec gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto_rr ${1+"$@"}
}

#   run mosquitto_passwd(1) CLI
cmd_mosquitto_passwd () {
    exec gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto_passwd ${1+"$@"}
}

#   run mosquitto_pw(1) CLI
cmd_mosquitto_pw () {
    exec gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto_pw ${1+"$@"}
}

#   run mosquitto_passwd(1) CLI
cmd_passwd () {
    pwdfile="$MOSQUITTO_VARDIR/mosquitto-pwd.txt"
    if [[ $# -eq 1 ]]; then
        exec gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto_passwd $pwdfile $1
    elif [[ $# -eq 2 && $2 == "-" ]]; then
        exec gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto_passwd -D $pwdfile $1
    elif [[ $# -eq 2 ]]; then
        exec gosu $MOSQUITTO_UID:$MOSQUITTO_GID $MOSQUITTO_BINDIR/mosquitto_passwd -b $pwdfile $1 $2
    else
        echo "USAGE: passwd <username> [<password>]" 1>&2
        exit 1
    fi
}

#   dispatch according to command
if [[ $# -eq 0 ]]; then
    set -- start
fi
cmd="$1"; shift
case "$cmd" in
    boot )             cmd_boot             "$@" ;;
    start )            cmd_start            "$@" ;;
    backup )           cmd_backup           "$@" ;;
    restore )          cmd_restore          "$@" ;;
    mosquitto )        cmd_mosquitto        "$@" ;;
    mosquitto_pub )    cmd_mosquitto_pub    "$@" ;;
    mosquitto_sub )    cmd_mosquitto_sub    "$@" ;;
    mosquitto_rr )     cmd_mosquitto_rr     "$@" ;;
    mosquitto_passwd ) cmd_mosquitto_passwd "$@" ;;
    mosquitto_pw )     cmd_mosquitto_pw     "$@" ;;
    passwd )           cmd_passwd           "$@" ;;
    * )                fatal "unknown command: $cmd" ;;
esac
exit $?

