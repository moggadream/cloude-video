// 컨셉별 촬영 가이드 (하나의 원본). 텔레그램 /guide, 웹 가이드 화면, 스킬 문서가 모두 여기서 만들어진다.
// 스킬 문서 다시 만들기: node scripts/build-guides.js
//
// shot.type: 'photo' | 'video'   count: 장(개)   sec: 영상 한 개 길이(초)
// shot.uses: 어디에 쓰이는지 (hook=첫 장면, shorts·reels·tiktok, longform, carousel, blog, cover=표지/썸네일)
// shot.must: 꼭 필요한 컷

export const COMMON_TIPS = [
  '폰은 세로로 찍어요 (쇼츠·릴스·틱톡 기준). 대표 장면 2~3개만 가로로 한 번 더 찍으면 롱폼·블로그가 좋아져요.',
  '영상은 한 컷에 5~10초, 숨 참고 천천히. 빠르게 휘두르면 못 써요.',
  '가격표·메뉴판·안내판은 글자가 읽히게 가까이 한 장 더. AI가 이 글자를 읽어 대본을 써요.',
  '사람 얼굴이 크게 나오면 허락을 받거나 피해서 찍어요.',
  '찍고 나서 "메모.txt"에 사진으로 알 수 없는 것(맛, 대기 시간, 분위기, 아쉬운 점)을 한두 줄 적어 주세요.',
];

export const CONCEPTS = [
  {
    id: 'restaurant',
    label: '음식점·맛집',
    emoji: '🍜',
    tag: '맛집',
    category: 'restaurant',
    summary: '대표 메뉴가 주인공. 나오는 순간과 "한 입" 장면이 영상의 핵심이에요.',
    time: '15~20분 (음식 나오고 처음 3분이 가장 중요)',
    shots: [
      { id: 'exterior', name: '가게 외관·간판', type: 'photo', count: 2, how: '간판이 다 보이게 정면 1장, 입구 쪽 1장', uses: ['blog', 'longform'], must: true },
      { id: 'walkin', name: '들어가는 장면', type: 'video', count: 1, sec: 5, how: '문 앞에서 안으로 걸어 들어가기', uses: ['longform', 'reels'] },
      { id: 'menu', name: '메뉴판', type: 'photo', count: 2, how: '전체 1장 + 대표 메뉴 가격 가까이 1장 (글자 또렷하게)', uses: ['blog', 'carousel'], must: true },
      { id: 'interior', name: '내부 분위기', type: 'photo', count: 2, how: '넓게 1장, 내 자리 시점 1장', uses: ['blog', 'carousel'] },
      { id: 'interior_v', name: '내부 둘러보기', type: 'video', count: 1, sec: 6, how: '천천히 왼쪽→오른쪽', uses: ['longform', 'tiktok'] },
      { id: 'side', name: '기본 반찬·세팅', type: 'photo', count: 1, how: '위에서 내려다보기', uses: ['blog'] },
      { id: 'serve', name: '음식 나오는 순간', type: 'video', count: 1, sec: 6, how: '테이블에 놓이는 순간부터. 놓치기 쉬우니 미리 켜두기', uses: ['hook', 'shorts', 'reels', 'tiktok'], must: true },
      { id: 'top', name: '대표 메뉴 위에서', type: 'photo', count: 1, how: '바로 위 90도, 그릇이 화면을 꽉 채우게', uses: ['cover', 'carousel', 'blog'], must: true },
      { id: 'angle45', name: '대표 메뉴 45도', type: 'photo', count: 1, how: '앉은 눈높이 비스듬히, 높이감이 보이게', uses: ['blog', 'carousel'] },
      { id: 'close', name: '대표 메뉴 가까이', type: 'photo', count: 1, how: '고기 결, 국물 기름, 소스 윤기가 보이게', uses: ['carousel', 'blog'] },
      { id: 'sizzle', name: '시즐 (김·지글지글·늘어남)', type: 'video', count: 2, sec: 4, how: '김 나는 것, 끓는 것, 치즈 늘어나는 것, 국물 뜨는 것 중 2개', uses: ['hook', 'shorts', 'reels', 'tiktok'], must: true },
      { id: 'bite', name: '한 입 들어 올리기', type: 'video', count: 1, sec: 4, how: '젓가락·숟가락으로 천천히 들어 카메라 쪽으로', uses: ['shorts', 'reels', 'tiktok'], must: true },
      { id: 'cut', name: '단면·속', type: 'photo', count: 1, how: '자르거나 반 갈라 속이 보이게 (만두, 돈가스, 빵)', uses: ['carousel', 'blog'] },
      { id: 'other', name: '다른 메뉴', type: 'photo', count: 2, how: '함께 시킨 메뉴 위에서 1장씩', uses: ['blog', 'carousel'] },
      { id: 'receipt', name: '영수증·주문 화면', type: 'photo', count: 1, how: '가격 확인용 (블로그 신뢰도)', uses: ['blog'] },
      { id: 'parking', name: '주차·웨이팅 안내', type: 'photo', count: 1, how: '주차 안내판, 웨이팅 기계', uses: ['blog'] },
    ],
    memo: ['맛 (짠맛·매운맛 정도, 양)', '웨이팅 시간', '주차 가능 여부', '영업시간·브레이크타임', '아쉬웠던 점 하나'],
    avoid: ['어두운 구석 자리 (사진이 누렇게 나와요)', '다 먹은 그릇', '다른 손님 얼굴'],
  },
  {
    id: 'cafe',
    label: '카페·디저트',
    emoji: '☕',
    tag: '카페',
    category: 'restaurant',
    summary: '공간이 반, 음료·디저트가 반. 빛 좋은 창가 자리를 먼저 잡으세요.',
    time: '15분',
    shots: [
      { id: 'exterior', name: '카페 외관', type: 'photo', count: 1, how: '간판·입구가 보이게', uses: ['blog'], must: true },
      { id: 'exterior_v', name: '외관에서 입장', type: 'video', count: 1, sec: 5, how: '문 열고 들어가기', uses: ['reels', 'longform'] },
      { id: 'menu', name: '메뉴판', type: 'photo', count: 2, how: '음료 1장 + 디저트 1장, 가격 읽히게', uses: ['blog', 'carousel'], must: true },
      { id: 'space', name: '인테리어·좌석', type: 'photo', count: 3, how: '전체 1, 포인트 공간 1, 창가 자리 1', uses: ['carousel', 'blog', 'cover'], must: true },
      { id: 'space_v', name: '공간 둘러보기', type: 'video', count: 1, sec: 8, how: '천천히 한 바퀴', uses: ['reels', 'tiktok', 'longform'] },
      { id: 'drink', name: '음료', type: 'photo', count: 2, how: '45도 1장 + 위에서 1장 (라떼아트)', uses: ['carousel', 'blog'], must: true },
      { id: 'dessert', name: '디저트', type: 'photo', count: 2, how: '전체 1장 + 단면 1장', uses: ['cover', 'carousel', 'blog'], must: true },
      { id: 'pour', name: '시즐 (따르기·포크로 자르기)', type: 'video', count: 2, sec: 4, how: '시럽·우유 따르기, 케이크 포크로 자르기', uses: ['hook', 'shorts', 'reels', 'tiktok'], must: true },
      { id: 'view', name: '창밖·뷰', type: 'photo', count: 1, how: '음료와 창밖이 한 화면에', uses: ['reels', 'carousel'] },
      { id: 'photozone', name: '포토존·소품', type: 'photo', count: 1, how: '사람들이 사진 찍는 곳', uses: ['carousel'] },
    ],
    memo: ['맛 (단맛, 산미)', '좌석 수·콘센트·와이파이', '주차', '혼잡한 시간대', '아쉬웠던 점'],
    avoid: ['역광 (창을 등지고 음식 찍기)', '다 마신 컵'],
  },
  {
    id: 'mart',
    label: '마트·창고형 마트',
    emoji: '🛒',
    tag: '마트',
    category: 'mart',
    summary: '"상품 + 가격표가 한 화면"이 전부예요. 할인 전/후 숫자가 보이면 최고.',
    time: '20~30분 (상품 10~20개)',
    shots: [
      { id: 'entrance', name: '입구·간판', type: 'photo', count: 1, how: '지점 이름이 보이게', uses: ['blog'], must: true },
      { id: 'entrance_v', name: '입장', type: 'video', count: 1, sec: 5, how: '카트 밀고 들어가기', uses: ['longform'] },
      { id: 'flyer', name: '행사 전단·행사 매대', type: 'photo', count: 2, how: '이번 주 행사 안내, 기간이 보이게', uses: ['blog', 'carousel'], must: true },
      { id: 'aisle', name: '코너 전경', type: 'video', count: 3, sec: 5, how: '정육·간식·생활용품 등 코너별 천천히', uses: ['longform', 'tiktok'] },
      { id: 'item', name: '상품 + 가격표', type: 'photo', count: 15, how: '상품과 가격표가 한 화면에, 가격표 글자 또렷하게. 할인 전/후 숫자와 기간까지', uses: ['shorts', 'reels', 'tiktok', 'carousel', 'blog'], must: true },
      { id: 'item_v', name: '상품 + 가격표 영상', type: 'video', count: 5, sec: 4, how: '상품에서 가격표로 천천히 옮겨가기 (가장 할인 큰 것)', uses: ['hook', 'shorts', 'reels', 'tiktok'], must: true },
      { id: 'cart', name: '장바구니·하울', type: 'photo', count: 1, how: '산 것 모아서 위에서', uses: ['carousel', 'blog'] },
      { id: 'receipt', name: '영수증', type: 'photo', count: 1, how: '총액 확인용', uses: ['blog'] },
      { id: 'info', name: '영업시간·주차 안내', type: 'photo', count: 1, how: '안내판', uses: ['blog'] },
    ],
    memo: ['방문 날짜 (할인 기간 확인용)', '사람 많음 정도', '살 만한 것 TOP3', '아쉬운 점 (품절 등)'],
    avoid: ['가격표가 반사돼 안 읽히는 각도', '흔들린 가격표 사진'],
  },
  {
    id: 'market',
    label: '전통시장',
    emoji: '🏮',
    tag: '시장',
    category: 'mart',
    summary: '골목의 활기 + 먹거리 시즐 + 손글씨 가격. 사람 냄새가 나는 장면이 핵심이에요.',
    time: '30~40분',
    shots: [
      { id: 'gate', name: '시장 입구·간판', type: 'photo', count: 1, how: '시장 이름이 보이게', uses: ['blog', 'cover'], must: true },
      { id: 'gate_v', name: '입구에서 걸어 들어가기', type: 'video', count: 1, sec: 8, how: '사람들 사이로 천천히 걷기', uses: ['hook', 'longform', 'reels'], must: true },
      { id: 'alley', name: '골목 전경', type: 'video', count: 2, sec: 8, how: '좌우 가게가 보이게 걷기', uses: ['longform', 'tiktok'] },
      { id: 'map', name: '시장 지도·안내도', type: 'photo', count: 1, how: '전체 배치 확인용', uses: ['blog'] },
      { id: 'stall', name: '가게 상품 + 가격', type: 'photo', count: 10, how: '손글씨 가격표가 보이게. 과일·반찬·떡 등', uses: ['shorts', 'carousel', 'blog'], must: true },
      { id: 'food_v', name: '먹거리 만드는 장면', type: 'video', count: 3, sec: 5, how: '전 부치기, 어묵 국물, 호떡 굽기 등 (시즐)', uses: ['hook', 'shorts', 'reels', 'tiktok'], must: true },
      { id: 'hand', name: '사장님 손·담아주는 장면', type: 'video', count: 1, sec: 5, how: '얼굴 대신 손 위주 (허락받기)', uses: ['reels', 'longform'] },
      { id: 'eat', name: '산 먹거리 클로즈업', type: 'photo', count: 3, how: '들고 한 장, 단면 한 장', uses: ['carousel', 'blog'] },
      { id: 'bite', name: '한 입', type: 'video', count: 1, sec: 4, how: '들어 올리기', uses: ['shorts', 'tiktok'] },
      { id: 'access', name: '주차장·교통 안내', type: 'photo', count: 1, how: '공영주차장 표지판 등', uses: ['blog'] },
    ],
    memo: ['장날·쉬는 날', '현금만 받는 가게', '추천 가게 이름', '주차·대중교통', '아쉬운 점'],
    avoid: ['상인 얼굴 클로즈업 (허락 없이)', '바닥만 나오는 걷기 영상'],
  },
  {
    id: 'park',
    label: '공원·산책',
    emoji: '🌳',
    tag: '공원',
    category: 'park_event',
    summary: '"여기 가면 이런 풍경" + "어떻게 가고 어디로 걸으면 되는지". 계절 포인트가 훅이에요.',
    time: '30~60분 (한 바퀴)',
    shots: [
      { id: 'gate', name: '입구·공원 이름', type: 'photo', count: 1, how: '표지석·간판', uses: ['blog'], must: true },
      { id: 'map', name: '안내 지도', type: 'photo', count: 1, how: '코스·화장실·주차장이 보이게', uses: ['blog', 'carousel'], must: true },
      { id: 'wide', name: '대표 풍경 넓게', type: 'photo', count: 3, how: '가장 예쁜 곳 3곳, 하늘 1/3', uses: ['cover', 'carousel', 'blog'], must: true },
      { id: 'wide_v', name: '대표 풍경 영상', type: 'video', count: 2, sec: 10, how: '아주 천천히 좌우로, 또는 가만히', uses: ['hook', 'shorts', 'reels', 'longform'], must: true },
      { id: 'walk', name: '산책로 걷기 (내 시점)', type: 'video', count: 2, sec: 10, how: '폰을 가슴 높이에 두고 천천히 걷기', uses: ['reels', 'tiktok', 'longform'] },
      { id: 'season', name: '계절 포인트 가까이', type: 'photo', count: 3, how: '꽃·단풍·눈 클로즈업', uses: ['carousel', 'blog'] },
      { id: 'spot', name: '포토스팟', type: 'photo', count: 2, how: '사람들이 줄 서서 찍는 곳', uses: ['carousel', 'reels'] },
      { id: 'facility', name: '편의시설', type: 'photo', count: 3, how: '화장실·매점·벤치·놀이터', uses: ['blog'] },
      { id: 'parking', name: '주차장', type: 'photo', count: 1, how: '요금 안내가 있으면 같이', uses: ['blog'] },
      { id: 'golden', name: '노을·야경 (선택)', type: 'video', count: 1, sec: 10, how: '가만히 세워서', uses: ['shorts', 'reels'] },
    ],
    memo: ['산책 코스 길이·소요 시간', '반려견·자전거 가능 여부', '주차 요금', '사람 많은 시간', '아쉬운 점'],
    avoid: ['정오 햇빛 (그림자 진하고 색이 날아가요)', '빠르게 휘두르는 영상'],
  },
  {
    id: 'amusement',
    label: '유원지·테마파크',
    emoji: '🎡',
    tag: '유원지',
    category: 'park_event',
    summary: '"얼마 내고, 뭘 타고, 몇 분 기다리는지". 가격표와 대기시간이 정보의 핵심이에요.',
    time: '반나절 (컷은 틈틈이)',
    shots: [
      { id: 'ticket', name: '매표소 요금표', type: 'photo', count: 2, how: '요금·할인 조건 글자 또렷하게', uses: ['blog', 'carousel'], must: true },
      { id: 'gate_v', name: '입장 장면', type: 'video', count: 1, sec: 6, how: '정문 넓게', uses: ['hook', 'longform'], must: true },
      { id: 'map', name: '지도', type: 'photo', count: 1, how: '전체 지도', uses: ['blog'] },
      { id: 'ride', name: '대표 놀이기구 넓게', type: 'video', count: 3, sec: 6, how: '움직이는 모습, 소리 함께', uses: ['hook', 'shorts', 'reels', 'tiktok'], must: true },
      { id: 'pov', name: '탑승 시점 (안전할 때만)', type: 'video', count: 1, sec: 10, how: '허용되는 기구만, 폰 꽉 잡기', uses: ['tiktok', 'shorts'] },
      { id: 'wait', name: '대기시간 안내판', type: 'photo', count: 2, how: '대기 분이 보이게', uses: ['blog', 'carousel'] },
      { id: 'show', name: '퍼레이드·공연', type: 'video', count: 1, sec: 10, how: '시작 시간 안내판도 사진으로', uses: ['reels', 'longform'] },
      { id: 'food', name: '먹거리 + 가격', type: 'photo', count: 3, how: '음식과 메뉴판 함께', uses: ['carousel', 'blog'] },
      { id: 'goods', name: '굿즈·기념품', type: 'photo', count: 1, how: '가격표와 함께', uses: ['blog'] },
      { id: 'night', name: '야경·불꽃 (선택)', type: 'video', count: 1, sec: 10, how: '세워서 가만히', uses: ['shorts', 'reels'] },
    ],
    memo: ['방문 요일·혼잡도', '실제로 기다린 시간', '키 제한·나이 제한', '꼭 탈 것 TOP3', '아쉬운 점'],
    avoid: ['탑승 중 위험한 촬영', '다른 아이 얼굴'],
  },
  {
    id: 'festival',
    label: '축제·행사',
    emoji: '🎪',
    tag: '축제',
    category: 'park_event',
    summary: '날짜·시간·장소가 생명. 포스터·현수막은 무조건 먼저 찍으세요.',
    time: '1~2시간',
    shots: [
      { id: 'poster', name: '포스터·현수막 (일정·시간)', type: 'photo', count: 2, how: '날짜·시간·프로그램표가 읽히게. 가장 중요!', uses: ['blog', 'carousel'], must: true },
      { id: 'overview', name: '행사장 전경', type: 'video', count: 2, sec: 8, how: '높은 곳에서 넓게, 사람 규모가 보이게', uses: ['hook', 'shorts', 'reels', 'longform'], must: true },
      { id: 'overview_p', name: '행사장 전경 사진', type: 'photo', count: 1, how: '넓게', uses: ['cover', 'blog'] },
      { id: 'booth', name: '부스·체험', type: 'photo', count: 6, how: '부스 이름·가격·체험 내용', uses: ['carousel', 'blog'], must: true },
      { id: 'stage', name: '공연·무대', type: 'video', count: 2, sec: 10, how: '무대 + 관객 함께', uses: ['reels', 'tiktok', 'longform'] },
      { id: 'food_v', name: '먹거리 시즐', type: 'video', count: 2, sec: 5, how: '굽고 튀기는 장면', uses: ['shorts', 'reels', 'tiktok'] },
      { id: 'food', name: '먹거리 + 가격', type: 'photo', count: 3, how: '음식과 가격판 함께', uses: ['carousel', 'blog'] },
      { id: 'crowd', name: '인파·대기줄', type: 'video', count: 1, sec: 6, how: '얼마나 붐비는지', uses: ['tiktok', 'longform'] },
      { id: 'access', name: '셔틀·주차·화장실 안내', type: 'photo', count: 2, how: '안내판', uses: ['blog'] },
      { id: 'night', name: '야간 조명·불꽃 (선택)', type: 'video', count: 1, sec: 10, how: '세워서', uses: ['shorts', 'reels'] },
    ],
    memo: ['방문 날짜·시간대', '혼잡도·대기시간', '주차·셔틀', '꼭 해볼 것', '아쉬운 점'],
    avoid: ['포스터 없이 찍기 (날짜를 AI가 알 수 없어요)', '무대만 길게'],
  },
  {
    id: 'popup',
    label: '팝업스토어·전시',
    emoji: '🎁',
    tag: '팝업',
    category: 'other',
    summary: '"예약·입장 방법 + 포토존 + 굿즈 가격". 기간 한정이라 날짜가 중요해요.',
    time: '30분',
    shots: [
      { id: 'front', name: '외관·대기줄', type: 'photo', count: 1, how: '간판 + 줄 길이', uses: ['blog'], must: true },
      { id: 'front_v', name: '입장', type: 'video', count: 1, sec: 6, how: '입구에서 안으로', uses: ['hook', 'reels', 'longform'], must: true },
      { id: 'notice', name: '운영 기간·예약 안내', type: 'photo', count: 1, how: '기간·시간·예약 방법이 읽히게', uses: ['blog', 'carousel'], must: true },
      { id: 'space_v', name: '공간 둘러보기', type: 'video', count: 2, sec: 8, how: '천천히 한 바퀴', uses: ['shorts', 'reels', 'tiktok', 'longform'] },
      { id: 'photozone', name: '포토존', type: 'photo', count: 3, how: '대표 포토존 정면', uses: ['cover', 'carousel', 'blog'], must: true },
      { id: 'goods', name: '굿즈 + 가격', type: 'photo', count: 5, how: '상품과 가격표 함께', uses: ['carousel', 'blog'], must: true },
      { id: 'activity', name: '체험·이벤트', type: 'video', count: 1, sec: 6, how: '참여하는 모습 (손 위주)', uses: ['tiktok', 'reels'] },
      { id: 'gift', name: '사은품·인증 이벤트', type: 'photo', count: 1, how: '받은 선물', uses: ['blog'] },
    ],
    memo: ['방문 날짜·대기 시간', '예약 필요 여부', '추천 굿즈', '아쉬운 점'],
    avoid: ['다른 방문객 얼굴'],
  },
];

export const CONCEPT_BY_ID = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));

/** 폴더 이름의 [태그]로 컨셉 찾기: [맛집] [카페] [마트] [시장] [공원] [유원지] [축제] [팝업] 등 */
const ALIASES = {
  restaurant: ['맛집', '음식', '음식점', '식당'],
  cafe: ['카페', '디저트', '베이커리', '빵집'],
  mart: ['마트', '코스트코', '트레이더스', '상점', '가게'],
  market: ['시장', '전통시장', '재래시장'],
  park: ['공원', '산책', '수목원', '둘레길'],
  amusement: ['유원지', '테마파크', '놀이공원', '놀이동산'],
  festival: ['축제', '행사', '페스티벌', '박람회'],
  popup: ['팝업', '팝업스토어', '전시', '전시회'],
};
export function conceptFromTag(tag) {
  const t = String(tag || '').trim();
  if (CONCEPT_BY_ID[t]) return t;
  return Object.entries(ALIASES).find(([, words]) => words.some((w) => t.includes(w)))?.[0] || null;
}

export function totals(concept) {
  const photos = concept.shots.filter((s) => s.type === 'photo').reduce((a, s) => a + s.count, 0);
  const videos = concept.shots.filter((s) => s.type === 'video').reduce((a, s) => a + s.count, 0);
  const videoSec = concept.shots.filter((s) => s.type === 'video').reduce((a, s) => a + s.count * (s.sec || 5), 0);
  const must = concept.shots.filter((s) => s.must);
  const mustPhotos = must.filter((s) => s.type === 'photo').reduce((a, s) => a + s.count, 0);
  const mustVideos = must.filter((s) => s.type === 'video').reduce((a, s) => a + s.count, 0);
  return { photos, videos, videoSec, mustPhotos, mustVideos };
}

const USE_LABEL = {
  hook: '첫 장면', shorts: '쇼츠', reels: '릴스', tiktok: '틱톡', longform: '롱폼', carousel: '캐러셀', blog: '블로그', cover: '표지',
};
export const useLabel = (u) => USE_LABEL[u] || u;

/** 텔레그램·텍스트용 체크리스트 */
export function guideText(concept) {
  const t = totals(concept);
  const lines = [
    `${concept.emoji} ${concept.label} 촬영 가이드`,
    concept.summary,
    `총 사진 ${t.photos}장 · 영상 ${t.videos}개 (약 ${Math.round(t.videoSec)}초) · ${concept.time}`,
    `꼭 필요한 것만: 사진 ${t.mustPhotos}장 · 영상 ${t.mustVideos}개 (⭐ 표시)`,
    '',
  ];
  concept.shots.forEach((s, i) => {
    const kind = s.type === 'photo' ? `📷 ${s.count}장` : `🎥 ${s.count}개 × ${s.sec}초`;
    lines.push(`${i + 1}. ${s.must ? '⭐ ' : ''}${s.name} — ${kind}`);
    lines.push(`   ${s.how}`);
  });
  lines.push('', '📝 메모.txt 에 적어 주세요', ...concept.memo.map((m) => `• ${m}`));
  lines.push('', '🚫 피하기', ...concept.avoid.map((m) => `• ${m}`));
  lines.push('', `📁 드라이브 폴더 이름 예: [${concept.tag}] 가게·장소 이름`);
  return lines.join('\n');
}
