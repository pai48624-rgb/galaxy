// 검색어 다듬기(2026-10-14) — 머리줄 자동완성·검색 화면이 같이 씀.
// 대소문자 무시, 전각→반각(NFKC), 띄어쓰기·하이픈·점·괄호 등 무시: "gpt4o"=GPT-4o, "dall e"=DALL-E, "Chat GPT"=ChatGPT
export const norm = (s?: string) => (s || '').normalize('NFKC').toLowerCase().replace(/[\s\-_.·・()\[\]{}'"`,/:+!?~]/g, '');
