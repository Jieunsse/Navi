import { DocPage } from "@/shared/ui/Markdown";

// shortcut: 개인정보 처리방침 전문이 아직 없어 이용약관 제9조(개인정보)를 보여준다.
export default function PrivacyPage() {
  return <DocPage file="10-terms-of-service-draft.md" section="## 제9조 (개인정보)" />;
}
