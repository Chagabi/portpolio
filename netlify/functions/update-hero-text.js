// netlify/functions/update-hero-text.js

const admin = require('firebase-admin');
// --- Firebase Admin SDK 초기화 (위의 함수와 동일하게!) ---
// (생략 - 위의 get-hero-info.js의 초기화 부분 복사!)

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') { /* ... */ }
    if (!admin.apps.length) { /* ... */ }

    try {
        const { title, subtitle } = JSON.parse(event.body); // 클라이언트에서 title, subtitle을 보내줘야 함

        if (title === undefined || subtitle === undefined) {
            return { statusCode: 400, body: JSON.stringify({ message: '제목과 부제목이 필요하다옹!' }) };
        }

        const heroDataToUpdate = {
            title: title,
            subtitle: subtitle,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('siteConfig').doc('hero').set(heroDataToUpdate, { merge: true });
        console.log('야옹! 히어로 텍스트 Firestore에 업데이트 성공!');

        return {
            statusCode: 200,
            body: JSON.stringify({ message: '히어로 텍스트 업데이트 성공!', data: heroDataToUpdate }),
        };

    } catch (error) { /* ... (에러 처리) ... */ }
};