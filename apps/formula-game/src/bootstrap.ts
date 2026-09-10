// Keep the initial shell visible while the application module loads.
void import("./main").catch(() => {
  const root = document.getElementById("root");
  if (!root) return;
  const panel = document.createElement("section");
  panel.className = "boot-screen";
  panel.setAttribute("role", "alert");
  const title = document.createElement("h1");
  title.textContent = "공식 한 칸을 불러오지 못했어요";
  const note = document.createElement("p");
  note.textContent = "연결 상태를 확인하고 다시 시도해 주세요.";
  const retry = document.createElement("button");
  retry.textContent = "다시 불러오기";
  retry.addEventListener("click", () => location.reload());
  panel.append(title, note, retry);
  root.replaceChildren(panel);
});
