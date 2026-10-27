@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   示例百业 · 照片墙数据更新
echo   扫描 assets\img\photos\ 里的图片 -^> 生成 data\photos.js
echo   文件名写法：标题.jpg   或   标题@投稿人.jpg
echo ============================================================
echo.

node tools\scan-photos.js

echo.
echo ============================================================
echo   完成后：把这两样上传到网站根目录
echo     1. assets\img\photos  文件夹（里面的图片）
echo     2. data\photos.js
echo ============================================================
echo.
pause
