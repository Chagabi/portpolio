// netlify/functions/upload-image-to-gcs.js

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy'); // 파일 처리 도우미!

let storage;
const BUCKET_NAME = 'uucats-repository-images'; // 네 버킷 이름, 아주 잘 넣었다옹! 👍

// Netlify 환경 변수에서 서비스 계정 키 JSON 내용을 읽어온다옹.
// 이 환경 변수 이름은 네가 Netlify에 설정한 이름과 같아야 한다냥!
// 보통 'GOOGLE_APPLICATION_CREDENTIALS_JSON'을 많이 쓴다옹.
const GCS_CREDENTIALS_JSON = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

if (GCS_CREDENTIALS_JSON) {
    try {
        const credentials = JSON.parse(GCS_CREDENTIALS_JSON);
        storage = new Storage({ credentials });
        console.log('야옹! 구글 클라우드 서비스 계정 키를 환경 변수에서 성공적으로 불러왔다옹!');
    } catch (e) {
        console.error('냐옹... GOOGLE_APPLICATION_CREDENTIALS_JSON 환경 변수를 JSON으로 파싱하는데 실패했다옹! 내용을 다시 확인해달라냥!', e);
        // storage 객체가 초기화되지 않으면 아래 로직에서 에러가 발생한다냥.
        // 이 경우 함수가 더 이상 진행되지 않도록 에러를 던지는 게 좋다옹.
        throw new Error('서비스 계정 키 JSON 파싱 실패! Netlify 환경 변수 설정을 확인해달라옹!');
    }
} else {
    console.error('냐아아앙!!! GOOGLE_APPLICATION_CREDENTIALS_JSON 환경 변수를 찾을 수 없다옹! Netlify에 설정했는지 확인해달라냥!');
    // storage = new Storage(); // 이 경우 "Could not load the default credentials" 에러가 발생한다냥.
    throw new Error('서비스 계정 키 환경 변수가 설정되지 않았다옹! Netlify 설정을 확인해달라옹!');
}

// Busboy로 multipart/form-data 파싱하는 헬퍼 함수다옹
const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({
            headers: {
                // 헤더 이름은 대소문자를 가릴 수 있으니 둘 다 확인한다옹!
                'content-type': event.headers['content-type'] || event.headers['Content-Type']
            }
        });
        const fields = {};
        let fileData = null;
        let fileMimeType = null;
        let originalFileName = null;

        // busboy의 'file' 이벤트에서 세 번째 인자는 객체로 들어온다옹 (filename, encoding, mimetype 포함)
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
            fields[fieldname] = val;
        });

        busboy.on('finish', () => {
            resolve({ ...fields, fileData, originalFileName, fileMimeType });
        });

        busboy.on('error', err => {
            console.error('Busboy 파싱 중 에러 발생이다옹!', err);
            reject(err);
        });

        // event.body가 base64로 인코딩 되어 있는지 확인!
        const encoding = event.isBase64Encoded ? 'base64' : 'binary';
        // event.body가 undefined나 null이 아닌지 확인 후 Buffer.from을 사용한다옹.
        if (event.body) {
            busboy.end(Buffer.from(event.body, encoding));
        } else {
            reject(new Error('요청 body가 비어있다옹! 파일이 제대로 전달되지 않은 것 같다냥.'));
        }
    });
};


exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'POST 요청만 받는다냥!' }) };
    }

    // storage 객체가 성공적으로 초기화되었는지 한번 더 확인한다옹.
    if (!storage) {
        console.error('냐옹! Storage 객체가 초기화되지 않아서 파일 업로드를 진행할 수 없다옹!');
        return {
            statusCode: 500,
            body: JSON.stringify({ message: '서버 내부 설정 오류다옹. 관리자 고양이에게 문의해달라냥!' }),
        };
    }

    try {
        const { fileData, originalFileName, fileMimeType, title, category } = await parseMultipartForm(event);

        if (!fileData) {
            return { statusCode: 400, body: JSON.stringify({ message: '이미지 파일이 없다옹! 다시 확인해달라냥!' }) };
        }

        // 혹시 originalFileName이 undefined일 경우를 대비해서 기본 파일 이름을 만들어준다옹.
        const safeOriginalFileName = originalFileName || 'unknown-file';
        const gcsFileName = `gallery/${Date.now()}-${safeOriginalFileName.replace(/\s+/g, '_')}`; // 공백을 밑줄로 변경
        const file = storage.bucket(BUCKET_NAME).file(gcsFileName);

        await file.save(fileData, {
            metadata: { contentType: fileMimeType || 'application/octet-stream' }, // MIME 타입이 없으면 기본값 사용
        });

        await file.makePublic();

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;

        console.log(`야옹! 파일 업로드 성공! ${publicUrl}`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: '파일 업로드 성공이다옹! 냐항!',
                publicUrl: publicUrl,
                fileNameInGCS: gcsFileName
            }),
        };

    } catch (error) {
        // 에러 객체와 메시지를 더 자세히 로깅한다옹.
        console.error('Netlify Function에서 파일 업로드 중 심각한 에러 발생이다옹! 냐아아앙!', error);
        let errorMessage = '서버에서 야옹... 알 수 없는 문제가 생겼다옹.';
        if (error instanceof Error) { // error가 Error 객체인지 확인
            errorMessage = `서버에서 야옹... 문제가 생겼다옹: ${error.message}`;
        } else if (typeof error === 'string') {
            errorMessage = `서버에서 야옹... 문제가 생겼다옹: ${error}`;
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ message: errorMessage }),
        };
    }
};