import puppeteer from 'puppeteer-core';
import { defaultServerURL } from '../common/override';

const role = process.argv.includes("admin") ? "admin" : "client";


(async () => {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--headless=new",
            "--ozone-platform=headless"
        ]
    });
    const page = await browser.newPage();
    page.on("console", (msg) => {
        const level = msg.type();
        const text = msg.text();
        if (level == "log" && text.startsWith("[PERF]")) {
            console.log(text);
        }
    });
    page.on('dialog', async (dialog) => {
        console.log("[Dialog]", dialog.message());
        await dialog.accept();
    })
    page.on("error", (err)=>{
        console.log("[Error]", err.name, err.message, err.stack);
    })

    const url = `${defaultServerURL}/test.html?room=SPEED&role=${role}`;
    console.log(url);
    await page.goto(url);
})();