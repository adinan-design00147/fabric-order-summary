#!/usr/bin/env bash
# อัปเดตเลขเวอร์ชันใน app.html + version.txt ให้ตรงกัน แล้วค่อย commit
# (ถ้าลืมทำ version.txt ตัวเช็กเวอร์ชันจะเตือนผิด)
set -e
BUILD=$(date +%Y%m%d-%H%M)
sed -i "s/APP_BUILD = '[^']*'/APP_BUILD = '$BUILD'/" app.html
printf '%s\n' "$BUILD" > version.txt
echo "build = $BUILD"
