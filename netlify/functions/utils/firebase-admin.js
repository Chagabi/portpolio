// netlify/functions/utils/firebase-admin.js

const admin = require('firebase-admin');

// Firebase Admin SDK 초기화를 위한 변수
let db;

/**
 * Firebase Admin SDK 초기화 함수
 * @returns {FirebaseFirestore.Firestore} 초기화된 Firestore 인스턴스
 */
function getFirestore() {
  // 이미 초기화된 경우 기존 인스턴스 반환
  if (db) {
    return db;
  }

  // 환경 변수 확인
  const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
  const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
  const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error('Firebase 환경 변수가 설정되지 않았습니다!');
  }

  try {
    // 서비스 계정 설정
    const serviceAccount = {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };

    // 앱이 이미 초기화되었는지 확인 (중복 초기화 방지)
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin SDK 초기화 성공!');
    }

    // Firestore 인스턴스 할당
    db = admin.firestore();
    return db;
  } catch (error) {
    console.error('Firebase 초기화 실패:', error);
    throw new Error(`Firebase 초기화 오류: ${error.message}`);
  }
}

module.exports = {
  getFirestore,
  admin // admin 객체도 내보내서 필요한 경우 사용할 수 있게 함
};