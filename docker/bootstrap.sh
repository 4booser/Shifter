#!/usr/bin/env bash
# Prepares a fresh VPS to run Shifter. Handles Arch and Debian/Ubuntu, because
# those are what people actually get handed by a provider.
#
# Idempotent: running it twice changes nothing the second time, which matters
# because the first run is the one most likely to be interrupted.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR=/opt/shifter

if [ "$(id -u)" -ne 0 ]; then
    echo "нужен root" >&2
    exit 1
fi

# ==== Which distribution ====

. /etc/os-release
FAMILY=""

case "${ID}${ID_LIKE:-}" in
    *arch*) FAMILY=arch ;;
    *debian*|*ubuntu*) FAMILY=debian ;;
    *) echo "неизвестный дистрибутив: $ID" >&2; exit 1 ;;
esac

echo "==> $PRETTY_NAME ($FAMILY)"

# ==== Packages ====

if [ "$FAMILY" = arch ]; then
    # Never -Sy on its own: Arch is a rolling release and a partial upgrade
    # leaves a system that installs packages against libraries it does not
    # have. -Syu is the only safe form.
    pacman -Syu --noconfirm --needed \
        git curl ufw fail2ban docker docker-compose docker-buildx
else
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl git ufw fail2ban

    if ! command -v docker >/dev/null; then
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
            -o /etc/apt/keyrings/docker.asc
        chmod a+r /etc/apt/keyrings/docker.asc

        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
            > /etc/apt/sources.list.d/docker.list

        apt-get update -qq
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
            docker-buildx-plugin docker-compose-plugin
    fi
fi

systemctl enable --now docker

# Arch ships compose as a standalone binary in some versions; the CLI only
# finds it as "docker compose" when it sits in a plugin directory.
if ! docker compose version >/dev/null 2>&1; then
    if [ -x /usr/bin/docker-compose ]; then
        install -d /usr/local/lib/docker/cli-plugins
        ln -sf /usr/bin/docker-compose \
            /usr/local/lib/docker/cli-plugins/docker-compose
    fi
fi

# ==== Deploy user ====

# Deployments do not need root. This user can drive docker and nothing else.
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash "$DEPLOY_USER"
    passwd --lock "$DEPLOY_USER"
fi

usermod -aG docker "$DEPLOY_USER"

install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"

# The key that reached root is the key that should reach the deploy user.
if [ -f /root/.ssh/authorized_keys ]; then
    install -m 0600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
        /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR/docker"

# ==== Firewall ====

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
# Postgres is not published by the production stack, so no rule for it exists —
# deliberately absent rather than forgotten.
ufw --force enable
systemctl enable ufw

# ==== SSH ====

# Password logins are the most attacked door on a public host, and by this
# point the key is already installed.
SSHD_CONFIG=/etc/ssh/sshd_config

sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"

# Refuse to lock the door with the key still inside.
if [ ! -s /root/.ssh/authorized_keys ]; then
    echo "нет ключей в /root/.ssh/authorized_keys — пароль оставлен включённым" >&2
    sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' "$SSHD_CONFIG"
fi

sshd -t && (systemctl reload sshd 2>/dev/null || systemctl reload ssh)

systemctl enable --now fail2ban

# ==== Swap ====

# A 1 GB VPS runs the app comfortably but has no headroom for a surprise.
# Images are built by CI, not here, so this is insurance rather than a
# requirement.
if [ ! -f /swapfile ] && [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 2048 ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo
echo "готово."
docker --version
docker compose version
echo "пользователь: $DEPLOY_USER"
echo "каталог:      $APP_DIR"
