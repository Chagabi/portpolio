// netlify/functions/get-photos.js

// 공통 Firebase 모듈 가져오기
const { getFirestore } = require('./utils/firebase-admin');

exports.handler = async (event, context) => {
  // HTTP 메소드 확인
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: 'GET 요청만 허용됩니다.' })
    };
  }

  try {
    // 공통 모듈에서 Firestore 인스턴스 가져오기
    const db = getFirestore();
    
    // 쿼리 최적화: 필요한 필드만 선택, 결과 제한
    const photosSnapshot = await db.collection('photos')
      .orderBy('createdAt', 'desc')
      .limit(20) // 결과 개수 제한 (필요시 페이지네이션 구현)
      .get();

    if (photosSnapshot.empty) {
      console.log('사진이 없습니다.');
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify([])
      };
    }

    const photosList = photosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`총 ${photosList.length}개의 사진 정보를 가져왔습니다.`);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60" // 1분 캐싱 (자주 업데이트되는 컨텐츠)
      },
      body: JSON.stringify(photosList)
    };

  } catch (error) {
    console.error('사진 목록 읽기 에러:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: `서버 에러: ${error.message || '알 수 없는 오류'}` })
    };
  }
};