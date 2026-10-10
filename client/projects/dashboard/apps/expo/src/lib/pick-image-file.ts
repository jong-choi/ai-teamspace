// native 사진 선택은 아직 연결하지 않았다. image picker native module을 추가할 때 이 파일을 구현한다.
export function pickImageFile(): Promise<Blob | null> {
  return Promise.reject(
    new Error('이 기기에서는 아직 사진을 고를 수 없습니다.'),
  );
}
