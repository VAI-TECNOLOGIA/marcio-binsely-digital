#!/bin/bash
# Dispara os "feliz aniversário" do dia (chamado pelo crontab às 9h BRT).
SECRET=$(grep -m1 '^CRON_SECRET=' /var/www/marcio/backend/.env | cut -d= -f2- | tr -d '"')
STAMP=$(date '+%Y-%m-%d %H:%M')
RESP=$(curl -s -H "Authorization: Bearer $SECRET" https://app.marciobinsely.site/api/cron/aniversarios)
echo "[$STAMP] aniversarios: $RESP" >> /var/log/mbd-cron.log
