#!/usr/bin/env bash

log_file=$1

tail -f $log_file | grep "batchDurationMs"

