require('dotenv').config();
const axios = require('axios');
const ical = require('node-ical');
const express = require('express');
const schedule = require('node-schedule');
const app = express();



const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN;
const CALENDAR_URLS = JSON.parse(process.env.CALENDAR_URLS || '[]');

// ส่วนที่เหลือของโค้ดยังคงเหมือนเดิม...

function sendLineNotify(message) {
    console.log('กำลังส่งข้อความ:', message);
    return axios.post('https://notify-api.line.me/api/notify', 
        `message=${message}`,
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${LINE_NOTIFY_TOKEN}`
            }
        }
    ).then(response => {
        console.log('ส่งข้อความสำเร็จ:', response.data);
    }).catch(error => {
        console.error('เกิดข้อผิดพลาดในการส่งข้อความ:', error.response ? error.response.data : error.message);
    });
}

function getEventsFromCalendar(url) {
    console.log('กำลังดึงข้อมูลจากปฏิทิน:', url);
    // เปลี่ยน webcal:// เป็น https://
    const httpsUrl = url.replace('webcal://', 'https://');
    return new Promise((resolve, reject) => {
        ical.fromURL(httpsUrl, {}, (error, data) => {
            if (error) {
                console.error('เกิดข้อผิดพลาดในการดึงข้อมูลปฏิทิน:', error);
                reject(error);
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const todayEvents = Object.values(data)
                .filter(event => event.type === 'VEVENT')
                .filter(event => {
                    const eventDate = new Date(event.start);
                    return eventDate >= today && eventDate < tomorrow;
                })
                .map(event => event.summary);
            
            console.log('พบกิจกรรมวันนี้:', todayEvents);
            resolve(todayEvents);
        });
    });
}

async function getTodayEvents() {
    try {
        console.log('เริ่มดึงข้อมูลกิจกรรมจากทุกปฏิทิน');
        const allEvents = await Promise.all(CALENDAR_URLS.map(getEventsFromCalendar));
        const flattenedEvents = allEvents.flat();
        console.log('รวมกิจกรรมทั้งหมด:', flattenedEvents);
        return flattenedEvents;
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลปฏิทิน:', error);
        return [];
    }
}

async function notifyTodayEvents() {
    try {
        console.log('เริ่มกระบวนการแจ้งเตือนกิจกรรมวันนี้');
        const events = await getTodayEvents();
        if (events.length === 0) {
            console.log('ไม่มีกิจกรรมวันนี้');
            await sendLineNotify('ไม่มีกิจกรรมวันนี้');
        } else {
            const message = `กิจกรรมวันนี้:\n${events.join('\n')}`;
            console.log('ส่งข้อความแจ้งเตือน:', message);
            await sendLineNotify(message);
        }
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการแจ้งเตือน:', error);
    }
}

app.get('/', (req, res) => {
    res.send('Line Notify Calendar Service is running!');
});

app.get('/notify', async (req, res) => {
    await notifyTodayEvents();
    res.send('Notification sent!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// ตั้งเวลาให้ทำงานทุกวันเวลา 05:00 น. (เวลาของ server)
schedule.scheduleJob('0 5 * * *', notifyTodayEvents);

console.log('เริ่มการทำงานของสคริปต์แล้ว');