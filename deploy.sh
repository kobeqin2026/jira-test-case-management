#!/bin/bash
# Deploy frontend files to nginx
# Usage: ./deploy.sh

set -e

echo "Deploying frontend files..."

# Copy HTML
sudo cp /home/br188/jira-testcase-manager/public/jira-test-case-management.html /var/www/jira-testcase/
sudo chown www-data:www-data /var/www/jira-testcase/jira-test-case-management.html
sudo chmod 644 /var/www/jira-testcase/jira-test-case-management.html

# Copy JS
sudo cp /home/br188/jira-testcase-manager/public/js/testcase-upload.js /var/www/jira-testcase/js/
sudo chown www-data:www-data /var/www/jira-testcase/js/testcase-upload.js
sudo chmod 644 /var/www/jira-testcase/js/testcase-upload.js

echo "Frontend deployed OK"
echo "Access at: http://<server-ip>:8089/"
