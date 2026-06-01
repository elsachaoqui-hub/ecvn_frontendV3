import SettlementPreSettlementPage from '@/components/SettlementPreSettlementPage';

/** 5.2 月結算：與 5.1 預結算共用完整畫面（RE 目標、桑基明細表、15 分鐘編輯等） */
export default function SettlementMonthlyPage() {
  return <SettlementPreSettlementPage variant="monthly" />;
}
