// netlify/functions/upload-hero-image.js
// 히어로 이미지 업로드 전용 함수다옹!

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy'); // 파일 처리 도우미!

let storage;
const BUCKET_NAME = 'uucats-repository-images'; // 네 버킷 이름, 그대로 사용!
const GCS_CREDENTIALS_JSON = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON; // Netlify 환경 변수 이름!

if (GCS_CREDENTIALS_JSON) {
    try {
        const credentials = JSON.parse(GCS_CREDENTIALS_JSON);
        storage = new Storage({ credentials });
        console.log('야옹! (히어로) 구글 클라우드 서비스 계정 키를 성공적으로 불러왔다옹!');
    } catch (e) {
        console.error('냐옹... (히어로) GOOGLE_APPLICATION_CREDENTIALS_JSON 파싱 실패! 내용을 확인해달라냥!', e);
        throw new Error('서비스 계정 키 JSON 파싱 실패! (히어로)');
    }
} else {
    console.error('냐아아앙!!! (히어로) GOOGLE_APPLICATION_CREDENTIALS_JSON 환경 변수를 찾을 수 없다옹!');
    throw new Error('서비스 계정 키 환경 변수가 설정되지 않았다옹! (히어로)');
}

// Busboy로 multipart/form-data 파싱하는 헬퍼 함수 (upload-image-to-gcs.js와 동일)
const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({
            headers: {
                'content-type': event.headers['content-type'] || event.headers['Content-Type']
            }
        });
        const fields = {}; // 텍스트 필드를 담을 객체
        let fileData = null; // 파일 데이터를 담을 변수
        let fileMimeType = null; // 파일 MIME 타입을 담을 변수
        let originalFileName = null; // 원본 파일 이름을 담을 변수

        busboy.on('file', (fieldname, fileStream, fileInfo) => {
            originalFileName = fileInfo.filename;
            fileMimeType = fileInfo.mimeType;
            const buffers = [];
            fileStream.on('data', (data) => {
                buffers.push(data);
            });
            fileStream.on('end', () => {
                fileData = Buffer.concat(buffers);
            });
        });

        busboy.on('field', (fieldname, val) => {
            // 파일 외의 다른 폼 필드들 (예: title, category 등 - 히어로 이미지에서는 안 쓸 수도 있다냥)
            fields[fieldname] = val;
        });

        busboy.on('finish', () => {
            resolve({ ...fields, fileData, originalFileName, fileMimeType });
        });

        busboy.on('error', err => {
            console.error('Busboy (히어로) 파싱 중 에러 발생이다옹!', err);
            reject(err);
        });

        const encoding = event.isBase64Encoded ? 'base64' : 'binary';
        if (event.body) {
            busboy.end(Buffer.from(event.body, encoding));
        } else {
            reject(new Error('요청 body가 비어있다옹! (히어로)'));
        }
    });
};


exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받는다냥! (히어로)' }) };
    }

    if (!storage) {
        console.error('냐옹! (히어로) Storage 객체가 초기화되지 않아서 파일 업로드를 진행할 수 없다옹!');
        return {
            statusCode: 500,
            body: JSON.stringify({ message: '서버 내부 설정 오류다옹. (히어로)' }),
        };
    }

    try {
        // 히어로 이미지는 특별한 텍스트 필드(title, category) 없이 파일만 받을 수도 있다옹.
        // 클라이언트에서 'imageType' 같은 필드를 보내서 여기서 확인할 수도 있지만,
        // 이 함수는 히어로 전용이므로 그럴 필요는 없다냥.
        const { fileData, originalFileName, fileMimeType } = await parseMultipartForm(event);

        if (!fileData) {
            return { statusCode: 400, body: JSON.stringify({ message: '히어로 이미지 파일이 없다옹! 다시 확인해달라냥!' }) };
        }

        const safeOriginalFileName = originalFileName || 'unknown-hero-file';
        // 히어로 이미지는 보통 하나만 사용하고 덮어쓰는 경우가 많다옹.
        // 여기서는 파일 이름을 고정해서 항상 같은 이름으로 저장되도록 해보겠다냥.
        // 이렇게 하면 이전 히어로 이미지는 자동으로 새 이미지로 대체된다옹!
        // 만약 버전을 관리하고 싶다면 Date.now() 같은 걸 이름에 포함시키면 된다냥.
        const fileExtension = safeOriginalFileName.includes('.') ? safeOriginalFileName.substring(safeOriginalFileName.lastIndexOf('.')) : '.jpg'; // 확장자 추출 또는 기본값
        const gcsFileName = `hero/current-hero-image${fileExtension}`; // 고정된 파일 이름 + 원래 확장자

        const file = storage.bucket(BUCKET_NAME).file(gcsFileName);

        await file.save(fileData, {
            metadata: { contentType: fileMimeType || 'application/octet-stream' },
            // public: true, // 이 줄은 버킷이 균일 액세스이고 allUsers 뷰어 권한이 있다면 필요 없다옹.
                            // 그리고 이미 삭제하기로 결정했으니 여기서도 없어야 한다냥!
        });

        // await file.makePublic(); // 이 줄도 당연히 없어야 한다옹! (균일 액세스 버킷 규칙!)

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;

        console.log(`야옹! 히어로 이미지 업로드 성공! ${publicUrl}`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: '히어로 이미지 업로드 성공이다옹! 냐항!',
                publicUrl: publicUrl,
                fileNameInGCS: gcsFileName
            }),
        };

    } catch (error) {
        console.error('Netlify Function (히어로) 파일 업로드 중 에러 발생이다옹!', error);
        let errorMessage = '서버에서 야옹... (히어로) 알 수 없는 문제가 생겼다옹.';
        if (error instanceof Error) { errorMessage = `서버에서 야옹... (히어로) 문제가 생겼다옹: ${error.message}`; }
        else if (typeof error === 'string') { errorMessage = `서버에서 야옹... (히어로) 문제가 생겼다옹: ${error}`; }
        return { statusCode: 500, body: JSON.stringify({ message: errorMessage }) };
    }
};