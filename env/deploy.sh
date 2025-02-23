#!/bin/bash

docker compose down
docker load < game-bot.tar
mkdir -p /var/game-bot/{data,logs,postgres-data}
docker compose up -d
