#!/bin/bash

docker compose exec bot npx prisma migrate deploy
