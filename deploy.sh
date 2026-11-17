#!/bin/bash
# Deploy frontend files to nginx
# Usage: ./deploy.sh
#   DEPLOY_DIR  目标目录，默认 /var/www/jira-testcase（可用环境变量覆盖）

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/jira-testcase}"

echo "Deploying frontend files from $REPO_DIR to $DEPLOY_DIR ..."

# Copy HTML
sudo cp "$REPO_DIR/public/jira-test-case-management.html" "$DEPLOY_DIR/"
sudo chown www-data:www-data "$DEPLOY_DIR/jira-test-case-management.html"
sudo chmod 644 "$DEPLOY_DIR/jira-test-case-management.html"

# Copy JS (all of public/js/)
for f in "$REPO_DIR"/public/js/*.js; do
    [ -e "$f" ] || continue
    sudo cp "$f" "$DEPLOY_DIR/js/"
    sudo chown www-data:www-data "$DEPLOY_DIR/js/$(basename "$f")"
    sudo chmod 644 "$DEPLOY_DIR/js/$(basename "$f")"
done

echo "Frontend deployed OK"
echo "Access at: http://<server-ip>:8089/"
