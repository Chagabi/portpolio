// netlify/functions/get-hero-info.js

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
    
    const heroDocRef = db.collection('siteConfig').doc('hero');
    const doc = await heroDocRef.get();

    let responseData;
    if (!doc.exists) {
      console.log('hero 문서 없음, 기본값 반환');
      responseData = {
        title: '여기에 멋진 제목을!',
        subtitle: '여기는 부제목을 쓰는 공간이다옹!',
        imageUrl: '/api/placeholder/1200/500?text=Hero+Image'
      };
    } else {
      responseData = doc.data();
      console.log('Firestore에서 가져온 데이터:', responseData);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        // 데이터가 자주 변경되지 않는다면 캐싱 허용 (빠른 응답을 위해)
        "Cache-Control": "public, max-age=300" // 5분 캐싱
      },
      body: JSON.stringify(responseData)
    };

  } catch (error) {
    console.error('hero 정보 읽기 에러:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: `서버 에러: ${error.message || '알 수 없는 오류'}` })
    };
  }
};