import { useRegistration } from '@/contexts/RegistrationContext';
import { verifyContract } from '@/lib/api';

export default function ContractModal() {
  const {
    isContractModalOpen, editContractIndex, tempContract,
    closeContractModal, setTempContract, setTempContractDbData,
    isVerifying, setIsVerifying,
    saveAndNextContract, saveAndCloseContract,
  } = useRegistration();

  if (!isContractModalOpen) return null;

  const isEditMode = editContractIndex !== null;

  const handleVerify = async () => {
    if (!tempContract.serviceId) return;
    setIsVerifying(true);
    try {
      const result = await verifyContract(tempContract.serviceId);
      if (result.success && result.data) {
        setTempContract({ verified: true, dbData: result.data });
      }
    } catch {
      // handle error
    } finally {
      setIsVerifying(false);
    }
  };

  const handleServiceIdChange = (value: string) => {
    setTempContract({ serviceId: value, verified: false, dbData: null });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={closeContractModal}
      />

      {/* Modal */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl z-10 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold text-slate-800">
            <i className="fas fa-search mr-2 text-blue-500" />
            {isEditMode ? '編輯轉直供契約' : '驗證並匯入轉直供契約'}
          </h3>
          <button onClick={closeContractModal} className="text-slate-400 hover:text-red-500">
            <i className="fas fa-times text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-100/50">
          {/* Service ID Input (only in add mode) */}
          {!isEditMode && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                輸入轉直供契約編號 (SERVICE_ID)
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={tempContract.serviceId}
                  onChange={(e) => handleServiceIdChange(e.target.value)}
                  placeholder="例如: 14-9988-7766"
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-slate-800 font-mono text-lg focus:border-blue-500 focus:bg-white outline-none transition"
                />
                <button
                  onClick={handleVerify}
                  disabled={!tempContract.serviceId || isVerifying}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow hover:bg-blue-700 disabled:bg-slate-300 transition w-32 flex justify-center"
                >
                  {isVerifying ? <i className="fas fa-spinner fa-spin" /> : '驗證'}
                </button>
              </div>
            </div>
          )}

          {/* Verified Data */}
          {tempContract.verified && tempContract.dbData && (
            <div className="space-y-4">
              {/* Success message (only in add mode) */}
              {!isEditMode && (
                <div className="bg-emerald-100 text-emerald-800 px-4 py-2 rounded-lg text-xs font-bold border border-emerald-200 flex items-center">
                  <i className="fas fa-check-circle mr-2" /> CIS 資料庫連線成功，成功取得配對資料。
                </div>
              )}

              {/* Data Card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Master Info */}
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">申請者名稱 (APPL_NAME)</p>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={tempContract.dbData.master.applicant}
                        onChange={(e) => setTempContractDbData('master.applicant', e.target.value)}
                        className="font-black text-slate-800 border-b border-slate-300 focus:border-blue-500 outline-none bg-transparent mt-1"
                      />
                    ) : (
                      <p className="text-base font-black text-slate-800">{tempContract.dbData.master.applicant}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">主契約編號</p>
                    <p className="text-base font-mono font-bold text-blue-600">{tempContract.dbData.master.serviceId}</p>
                  </div>
                </div>

                {/* Endpoints Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left whitespace-nowrap">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="p-3 text-xs font-bold w-24">端點角色</th>
                        <th className="p-3 text-xs font-bold">名稱 (案場 / 用戶)</th>
                        <th className="p-3 text-xs font-bold">電號</th>
                        <th className="p-3 text-xs font-bold">表號</th>
                        <th className="p-3 text-xs font-bold text-right">容量 (kW)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {/* Gen Row */}
                      <tr className="hover:bg-yellow-50/50 transition">
                        <td className="p-3">
                          <span className="bg-yellow-100 text-yellow-800 text-[10px] px-2 py-1 rounded font-bold border border-yellow-200 whitespace-nowrap">
                            <i className="fas fa-sun mr-1" /> 發電端
                          </span>
                        </td>
                        <td className="p-3">
                          {isEditMode ? (
                            <input type="text" value={tempContract.dbData.gen.name}
                              onChange={(e) => setTempContractDbData('gen.name', e.target.value)}
                              className="w-full font-bold text-slate-800 border-b border-slate-300 focus:border-yellow-500 outline-none bg-transparent" />
                          ) : (
                            <span className="font-bold text-slate-800">{tempContract.dbData.gen.name}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {isEditMode ? (
                            <input type="text" value={tempContract.dbData.gen.elecNo}
                              onChange={(e) => setTempContractDbData('gen.elecNo', e.target.value)}
                              className="w-full font-mono border-b border-slate-300 focus:border-yellow-500 outline-none bg-transparent" />
                          ) : (
                            <span className="font-mono">{tempContract.dbData.gen.elecNo}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {isEditMode ? (
                            <input type="text" value={tempContract.dbData.gen.meterNo}
                              onChange={(e) => setTempContractDbData('gen.meterNo', e.target.value)}
                              className="w-full font-mono border-b border-slate-300 focus:border-yellow-500 outline-none bg-transparent" />
                          ) : (
                            <span className="font-mono">{tempContract.dbData.gen.meterNo}</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {isEditMode ? (
                            <input type="number" value={tempContract.dbData.gen.capacity}
                              onChange={(e) => setTempContractDbData('gen.capacity', Number(e.target.value))}
                              className="w-20 text-right font-black text-yellow-700 bg-yellow-50 border-b border-yellow-300 focus:border-yellow-500 outline-none" />
                          ) : (
                            <span className="font-black text-yellow-700 bg-yellow-50 px-2 py-1 rounded border border-yellow-100">
                              {tempContract.dbData.gen.capacity} kW
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Load Row */}
                      <tr className="hover:bg-red-50/50 transition">
                        <td className="p-3">
                          <span className="bg-red-100 text-red-800 text-[10px] px-2 py-1 rounded font-bold border border-red-200 whitespace-nowrap">
                            <i className="fas fa-industry mr-1" /> 用電戶
                          </span>
                        </td>
                        <td className="p-3">
                          {isEditMode ? (
                            <input type="text" value={tempContract.dbData.load.name}
                              onChange={(e) => setTempContractDbData('load.name', e.target.value)}
                              className="w-full font-bold text-slate-800 border-b border-slate-300 focus:border-red-500 outline-none bg-transparent" />
                          ) : (
                            <span className="font-bold text-slate-800">{tempContract.dbData.load.name}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {isEditMode ? (
                            <input type="text" value={tempContract.dbData.load.elecNo}
                              onChange={(e) => setTempContractDbData('load.elecNo', e.target.value)}
                              className="w-full font-mono border-b border-slate-300 focus:border-red-500 outline-none bg-transparent" />
                          ) : (
                            <span className="font-mono">{tempContract.dbData.load.elecNo}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {isEditMode ? (
                            <input type="text" value={tempContract.dbData.load.meterNo}
                              onChange={(e) => setTempContractDbData('load.meterNo', e.target.value)}
                              className="w-full font-mono border-b border-slate-300 focus:border-red-500 outline-none bg-transparent" />
                          ) : (
                            <span className="font-mono">{tempContract.dbData.load.meterNo}</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {isEditMode ? (
                            <input type="number" value={tempContract.dbData.load.capacity}
                              onChange={(e) => setTempContractDbData('load.capacity', Number(e.target.value))}
                              className="w-20 text-right font-black text-red-700 bg-red-50 border-b border-red-300 focus:border-red-500 outline-none" />
                          ) : (
                            <span className="font-black text-red-700 bg-red-50 px-2 py-1 rounded border border-red-100">
                              {tempContract.dbData.load.capacity} kW
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
          <button onClick={closeContractModal} className="px-4 py-2 rounded-lg font-bold text-slate-500 hover:bg-slate-100 transition">
            取消
          </button>
          <div className="flex space-x-3">
            {!isEditMode && (
              <button
                onClick={saveAndNextContract}
                disabled={!tempContract.verified}
                className="px-6 py-2 rounded-lg font-bold transition border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:border-slate-300 disabled:text-slate-400"
              >
                儲存，下一筆
              </button>
            )}
            <button
              onClick={saveAndCloseContract}
              disabled={!tempContract.verified}
              className="px-8 py-2 rounded-lg font-bold transition shadow-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              {isEditMode ? '儲存變更' : '完成'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
