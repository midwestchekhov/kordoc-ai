---
name: jokbo-convert
description: 의대 족보 HWP·HWPX를 본문·급분바 마크다운과 문제은행 JSON으로 바꿀 때, 또는 바꾼 족보로 공부·문제풀이를 시작할 때 쓴다.
---

# 족보 변환 (jokbo-tool)

도구는 사용자의 연결 폴더 `test` 안 `jokbo-tool/` 에 있다 (Mac: `~/Desktop/test/jokbo-tool`, Cowork 셸: `$HOME/mnt/test/jokbo-tool`).

## 돌리기

```bash
cd $HOME/mnt/test/jokbo-tool
node jokbo.mjs "<족보 파일이나 폴더>" [더 많은 파일·폴더…] -o "<출력 폴더>"
```

- HWP 도 HWPX 로 다시 저장할 필요 없이 그대로 넣는다.
- 출력 폴더를 안 주면 첫 입력 옆 `변환결과/`. 보통 과목 폴더 아래 `변환결과/` 로 둔다 (예: `../소흡/변환결과`).
- 족보 하나에 10~30초. 결과 폴더 이름은 원본 파일 이름.
- Cowork 셸에서는 npm 레지스트리가 막혀 있다. `npm install` 을 하지 말 것: `node_modules` 는 Cowork(linux-arm64)용으로 미리 깔려 있다. Mac 터미널에서 직접 돌리려면 거기서 한 번 `npm install` 해야 한다.
- Cowork 셸은 연결 폴더에서 파일을 지우지 못한다. 다시 돌리면 같은 이름 파일을 덮어쓴다.

## 결과 (족보마다 한 폴더)

| 파일 | 쓰임 |
|---|---|
| `본문.md` | 장(Ⅰ·Ⅱ…)별 본문. LLM 문맥으로 쓸 것 |
| `급분바.md` | 요약(급분바·끕분바·앞분바) |
| `머리말.md` | 표지·족원 말·출제 경향 표·학습목표 |
| `문제은행.json` | 문항: header·stem·choices·answer·explanation·type(mcq·ox·short·recall)·images, meta(subject·lecture·professor·professor_source·year·exam·source·group·appearances·flags·cluster_id·times_seen), 빈 analysis, 파일 끝 recurrence(해마다 반복된 묶음) |
| `강조.json` | 강조 조각: level 3 王 / 2 빨강·형광펜 / 1 굵게 / 0 곁말(회색) |
| `그림목록.json` | 그림마다 장·주변 글·signal(emphasized·passed·mixed·neutral·question) |
| `images/` | 긴 변 1600px webp |

마크다운 표기: 빨강 `<r>…</r>`, 형광펜 `==…==`, 회색 `<g>…</g>`, 곁말 문단 `> [곁말] …`, 王 은 그대로.

## 결과로 공부할 때

- 문제 풀이: `문제은행.json` 에서 발문·선지만 먼저 보여 주고, 사용자가 답한 뒤 정답·해설을 보여 준다. 그림이 있는 문항은 `images/` 의 그림을 함께 연다.
- 자주 나온 것: `recurrence` 를 해 수(`years`) 많은 순으로. 같은 묶음 안에서 정답이 해마다 다르면 같은 증례로 묻는 지점만 바꾼 것이니, 묶음 단위로 "출제될 수 있는 조건"과 "정답을 가르는 조건"을 정리한다. 이때 `analysis` 칸을 채워도 된다(`filled_by` 에 누가 채웠는지).
- 교수님별·연도별로 고를 때 `meta.professor_source` 가 `unstated` 면 족보에 교수님이 안 적힌 문항이다. 지어내지 말 것.
- 강조는 `강조.json` level 3·2 와 `그림목록.json` 의 emphasized 를 먼저 본다. 낱말 규칙이라 오판이 섞여 있다.
