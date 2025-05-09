// netlify/functions/upload-hero-image.js (개별 환경 변수 사용 버전)

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy');
const admin = require('firebase-admin');

let gcsStorage;
const BUCKET_NAME = 'uucats-repository-images';

const GCS_PROJECT_ID_ENV = process.env.GCS_PROJECT_ID;
const GCS_CLIENT_EMAIL_ENV = process.env.GCS_CLIENT_EMAIL;
const GCS_PRIVATE_KEY_ENV = process.env.GCS_PRIVATE_KEY;

if (GCS_PROJECT_ID_ENV && GCS_CLIENT_EMAIL_ENV && GCS_PRIVATE_KEY_ENV) {
    try {
        const gcsCredentials = {
            project_id: GCS_PROJECT_ID_ENV,
            client_email: GCS_CLIENT_EMAIL_ENV,
            private_key: GCS_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        gcsStorage = new Storage({ credentials: gcsCredentials, projectId: GCS_PROJECT_ID_ENV });
    } catch (e) {
        console.error('GCS (히어로) 개별 환경 변수 에러:', e);
        throw new Error('GCS (히어로) 서비스 계정 키 설정 실패!');
    }
} else {
    console.error('GCS (히어로) 개별 환경 변수 없음!');
    throw new Error('GCS (히어로) 서비스 계정 환경 변수 미설정!');
}

const FIREBASE_PROJECT_ID_ENV = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL_ENV = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY_ENV = process.env.FIREBASE_PRIVATE_KEY;

if (FIREBASE_PROJECT_ID_ENV && FIREBASE_CLIENT_EMAIL_ENV && FIREBASE_PRIVATE_KEY_ENV) {
    try {
        const firebaseServiceAccount = {
            projectId: FIREBASE_PROJECT_ID_ENV,
            clientEmail: FIREBASE_CLIENT_EMAIL_ENV,
            privateKey: FIREBASE_PRIVATE_KEY_ENV.replace(/\\n/g, '\n')
        };
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(firebaseServiceAccount)
            });
        }
    } catch (e) {
        console.error('Firebase (히어로) 개별 환경 변수 에러 또는 초기화 실패:', e);
    }
} else {
    console.error('Firebase (히어로) 개별 환경 변수 없음!');
}

const db = admin.firestore();

// netlify/functions/upload-hero-image.js (수정 제안)

// ... (초기화 코드는 동일) ...
const parseMultipartForm = (event) => { /* ... 이전과 동일 ... */ };

exports.handler = async (event, context) => {
    // ... (요청 검증 및 초기화 확인은 동일) ...

    try {
        const { fileData, originalFileName, fileMimeType, heroTitle, heroSubtitle } = await parseMultipartForm(event);

        if (!fileData) {
            return { statusCode: 400, body: JSON.stringify({ message: '히어로 이미지 파일이 없습니다.' }) };
        }

        const safeOriginalFileName = originalFileName || 'unknown-hero-file';
        // 냐옹! 파일 확장자를 좀 더 안전하게 가져오자옹!
        const fileExtensionMatch = safeOriginalFileName.match(/\.([^.]+)$/);
        const fileExtension = fileExtensionMatch ? fileExtensionMatch[0] : '.jpg'; // 확장자 없으면 .jpg 기본값

        // 냐옹! GCS 파일 이름에 타임스탬프를 넣어 매번 다른 이름으로 저장한다옹!
        const gcsFileName = `hero/hero-image-<span class="math-inline">\{Date\.now\(\)\}</span>{fileExtension}`; 
        const file = gcsStorage.bucket(BUCKET_NAME).file(gcsFileName);

        // 이미지 처리 (sharp) 로직이 필요하다면 여기에 추가! 
        // (이전 답변처럼 큰 이미지 대비용. 지금은 일단 파일 이름만 바꿔본다옹.)
        // let bufferToSave = fileData;
        // let mimeTypeToSave = fileMimeType || 'application/octet-stream';
        // try {
        //     console.log('히어로 이미지 sharp 처리 시도...');
        //     bufferToSave = await sharp(fileData)
        //         .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
        //         .jpeg({ quality: 85, progressive: true }) // 예시: JPG로 저장
        //         .toBuffer();
        //     mimeTypeToSave = 'image/jpeg'; // 최종 포맷에 맞게
        //     console.log('히어로 이미지 sharp 처리 완료');
        // } catch (sharpError) {
        //     console.warn('히어로 이미지 sharp 처리 실패 (원본 사용):', sharpError.message);
        //     // sharp 실패 시 원본 사용 (선택적)
        // }
        // await file.save(bufferToSave, { metadata: { contentType: mimeTypeToSave } });

        // 일단은 sharp 처리 없이 원본 저장 (파일 이름만 변경)
        await file.save(fileData, { metadata: { contentType: fileMimeType || 'application/octet-stream' } });


        const publicUrl = `https://storage.googleapis.com/<span class="math-inline">\{BUCKET\_NAME\}/</span>{gcsFileName}`;
        console.log(`새 히어로 이미지 GCS 업로드 성공: ${publicUrl}`);


        const heroDataToSave = {
            imageUrl: publicUrl, // 새 URL 저장!
            title: heroTitle || '여기에 멋진 제목을!',
            subtitle: heroSubtitle || '여기는 부제목을 쓰는 공간이다옹!',
            gcsFileName: gcsFileName, // GCS 파일 이름도 저장 (나중에 이전 파일 삭제 등에 활용 가능)
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Firestore에 새 정보로 덮어쓰기 (merge:false 또는 옵션 없이 set)
        await db.collection('siteConfig').doc('hero').set(heroDataToSave); 
        console.log('Firestore에 새 히어로 정보 저장 완료:', heroDataToSave);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: '히어로 이미지 업로드 및 정보 저장 성공!', publicUrl: publicUrl, newData: heroDataToSave }),
        };

    } catch (error) {
        console.error('Netlify Function (upload-hero-image) 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (upload-hero-image): ${error.message || '알 수 없는 오류'}` }) };
    }
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받습니다 (히어로)' }) };
    }

    if (!gcsStorage || !admin.apps.length || !db) {
        console.error('GCS 또는 Firebase 초기화 안됨 (히어로)');
        return { statusCode: 500, body: JSON.stringify({ message: '서버 내부 설정 오류 (GCS/Firebase 초기화 실패 - 히어로)' }) };
    }

    try {
        const { fileData, originalFileName, fileMimeType, heroTitle, heroSubtitle } = await parseMultipartForm(event);

        if (!fileData) {
            return { statusCode: 400, body: JSON.stringify({ message: '히어로 이미지 파일이 없습니다.' }) };
        }

        const safeOriginalFileName = originalFileName || 'unknown-hero-file';
        const fileExtension = safeOriginalFileName.includes('.') ? safeOriginalFileName.substring(safeOriginalFileName.lastIndexOf('.')) : '.jpg';
        const gcsFileName = `hero/current-hero-image${fileExtension}`;
        const file = gcsStorage.bucket(BUCKET_NAME).file(gcsFileName);

        await file.save(fileData, { metadata: { contentType: fileMimeType || 'application/octet-stream' } });

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;

        const heroDataToSave = {
            imageUrl: publicUrl,
            title: heroTitle || '여기에 멋진 제목을!',
            subtitle: heroSubtitle || '여기는 부제목을 쓰는 공간이다옹!',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('siteConfig').doc('hero').set(heroDataToSave, { merge: true });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: '히어로 이미지 업로드 및 정보 저장 성공!', publicUrl: publicUrl }),
        };

    } catch (error) {
        console.error('Netlify Function (히어로 GCS/DB) 에러:', error);
        return { statusCode: 500, body: JSON.stringify({ message: `서버 에러 (히어로 GCS/DB): ${error.message || ''}` }) };
    }
};