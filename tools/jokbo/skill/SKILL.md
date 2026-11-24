---
name: jokbo-convert
description: 의대 족보 HWP·HWPX를 본문·급분바 마크다운과 문제은행 JSON으로 바꿀 때, 또는 바꾼 족보로 공부·문제풀이를 시작할 때 쓴다.
---

# 족보 변환 (jokbo-tool)

도구는 사용자의 연결 폴더 `test` 안 `jokbo-tool/` 에 있다 (Mac: `~/Desktop/test/jokbo-tool`, Cowork 셸: `$HOME/mnt/test/jokbo-tool`).

## 시작 전에

- `test` 폴더가 이 세션에 연결돼 있어야 한다. `ls $HOME/mnt/` 에 `test` 가 없으면 먼저 그 폴더 접근을 요청한다.
- Cowork 셸은 호출 하나가 180초를 넘지 못하고, 백그라운드로 띄운 프로세스는 호출이 끝나면 같이 죽는다. 그래서 `&`·`nohup` 으로 돌리지 말고 `--budget 170` 으로 나눠 돌린다(아래).

## 돌리기

```bash
cd $HOME/mnt/test/jokbo-tool
node jokbo.mjs "<족보 파일이나 폴더>" [더 많은 파일·폴더…] -o "<출력 폴더>" --jobs 2 --budget 170
```

- 종료 코드 2 이거나 끝 줄에 "남음" 이 있으면 **같은 명령을 그대로 다시** 돌린다. 끝난 단계는 건너뛰고 남은 것만 이어서 한다. 0 이 나올 때까지.
- 실패(종료 코드 1)는 그 족보의 `상태.json` 의 `steps.<단계>.error` 를 읽고 사용자에게 알린다.
- 큰 족보 하나가 한 단계에 170초를 넘으면(조직학 실습 200MB 같은) `--step convert`, `--step questions`, `--step recurrence` 를 따로따로 돌린다.
- 끝났는지는 `구성.json` 이 아니라 `상태.json` 의 `done: true` 로 판단한다.
- 늘 전부 변환한다(필족 본문 포함). 무엇을 읽을지는 읽을 때 고른다: 아래 "결과로 공부할 때".
- HWP 도 HWPX 로 다시 저장할 필요 없이 그대로 넣는다.
- 출력 폴더를 안 주면 첫 입력 옆 `변환결과/`. 보통 과목 폴더 아래 `변환결과/` 로 둔다 (예: `../소흡/변환결과`). 결과 폴더 이름은 원본 파일 이름을 NFC 로 맞춘 것이라 `*샘창자*` 같은 패턴이 맞는다(원본 폴더의 Mac 파일 이름은 NFD 라 안 맞을 수 있다: 그때는 `find -iname` 대신 node 나 `ls | grep` 에 NFC 로 바꾼 글을 쓴다).
- 족보 하나에 단계마다 5~30초.
- Cowork 셸에서는 npm 레지스트리가 막혀 있다. `npm install` 을 하지 말 것: `node_modules` 는 Cowork(linux-arm64)용으로 미리 깔려 있다. Mac 터미널에서 직접 돌리려면 거기서 한 번 `npm install` 해야 한다.
- Cowork 셸은 연결 폴더에서 파일을 지우지 못한다. 다시 돌리면 같은 이름 파일을 덮어쓴다.

## 티로 노트 붙이기 (선택, 사용자가 티로를 쓸 때만)

1. 티로 연결로 그 과목 기간의 노트를 찾는다(`list_notes`, 제목이 "N교시 OOO 교수님").
2. 노트마다 `get_note` (include summary·documents) 결과를 파일 하나로 쓴다: `<출력 폴더>/../티로노트/<YYYYMMDD>_<N교시>_<교수님>.json` 에 `{title, createdAt, summary, documents}`. 검색 결과는 5KB 에서 잘리므로 `search_notes` 말고 `get_note` 를 쓴다.
3. `node jokbo.mjs --tiro "<티로노트 폴더>" -o "<출력 폴더>"` → 맞는 강의 폴더에 `티로_강조.md`. 못 맞춘 노트 목록이 나오면 사용자에게 알린다.

## 결과 (족보마다 한 폴더)

| 파일 | 쓰임 |
|---|---|
| `구성.json` | 장마다 갈래·판정 근거·길이, `read_order`(먼저 읽을 파일)·`fallback`(급분바가 안 잡힘). 맨 먼저 본다 |
| `상태.json` | 단계별 완료·걸린 초·오류, `done` |
| `급분바.md` | 요약 장 전부(급분바·앞분바·끕분바·끕쁀뺘·Summary 등). 공부의 기본 문맥 |
| `문족.md` | 기출·연습 문제 장 읽기용 |
| `본문.md` | 필족 본문. 필요할 때만 읽는다 |
| `전체.md` | 문서 전체 한 파일 |
| `머리말.md` | 표지·족원 말·출제 경향 표·학습목표 |
| `강조요약.json` | level 3 王·2 빨강 강조마다 걸린 문단·표 전체(王 제목이면 그 아래 몇 블록), 그림, `negative`("시험에 안 나옴"류). 요약본을 만들 때 먼저 본다 |
| `표.md`·`표목록.json` | 병합 칸을 푼 Markdown 표마다 장·강조 점수·그림. 표 중심 요약에 그대로 쓴다 |
| `문제은행.json` | 문항: id(날짜-교시-번호, 모르면 x)·header·stem·choices·answer·explanation·type(mcq·ox·short·recall)·images, meta(subject·lecture·professor·professor_source·year·exam·source·group·appearances·flags·cluster_id·times_seen), 빈 analysis, 파일 끝 recurrence(해마다 반복된 묶음) |
| `강조.json` | 강조 조각: level 3 王 / 2 빨강·형광펜 / 1 굵게 / 0 곁말(회색). `scope: paragraph` 는 王 만 있던 자리라 문단 전체 |
| `그림목록.json` | 그림마다 장·주변 글·signal(emphasized·passed·mixed·neutral·question) |
| `티로_강조.md` | 티로 노트를 붙였을 때만 |
| `images/` | 긴 변 1600px webp |

마크다운 표기: 빨강 `<r>…</r>`, 형광펜 `==…==`, 회색 `<g>…</g>`, 곁말 문단 `> [곁말] …`, 王 은 그대로.

## 결과로 공부할 때

- 읽는 차례: `구성.json` 의 `read_order` 를 따른다. 급분바가 잡혔으면 `급분바.md`·`문족.md` 로 시작하고, 거기 없는 내용을 묻거나 설명이 모자랄 때만 `본문.md` 에서 해당 장을 찾아 읽는다(통째로 읽지 말 것). `fallback: true` 면 급분바가 없으니 `본문.md` 를 정리 대신 쓴다. `티로_강조.md` 가 있으면 교수님이 수업에서 강조한 것으로 함께 본다.
- 요약본 만들기: `강조요약.json` 의 level 3 → 2 순으로, `표.md` 의 강조 점수 높은 표, 그 안의 그림을 쓴다. `negative: true` 는 "버려도 됨" 쪽으로.
- 문제 풀이: `문제은행.json` 에서 발문·선지만 먼저 보여 주고, 사용자가 답한 뒤 정답·해설을 보여 준다. 그림이 있는 문항은 `images/` 의 그림을 함께 연다.
- 자주 나온 것: `recurrence` 를 해 수(`years`) 많은 순으로. 같은 묶음 안에서 정답이 해마다 다르면 같은 증례로 묻는 지점만 바꾼 것이니, 묶음 단위로 "출제될 수 있는 조건"과 "정답을 가르는 조건"을 정리한다. 이때 `analysis` 칸을 채워도 된다(`filled_by` 에 누가 채웠는지).
- 교수님별·연도별로 고를 때 `meta.professor_source` 가 `unstated` 면 족보에 교수님이 안 적힌 문항이다. 지어내지 말 것.
- 강조는 낱말·색 규칙이라 오판이 섞여 있다(응원·인사 잡음은 거르지만 다 거르진 못한다).
