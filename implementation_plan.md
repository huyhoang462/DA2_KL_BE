# Tính Năng Tất Toán Doanh Thu (Revenue Settlement)

Implement toàn bộ luồng tất toán doanh thu sau khi sự kiện hoàn tất: FE gọi `claimFunds()` trên Smart Contract, parse `Transfer` logs từ USDT ERC20 để tách ra số tiền của Organizer và Admin, sau đó gọi BE để cập nhật trạng thái `settled` và lưu thông tin giao dịch vào DB, cuối cùng hiển thị thông tin đó trên `AdminEventDetailPage`.

---

## Open Questions

> [!IMPORTANT]
> **Model `SettlementLog` mới hay dùng model sẵn?**  
> Thông tin tất toán (txHash, ngày giờ, netRevenue cho organizer, totalDeduction cho admin) nên được lưu vào:
> - **Option A (Đề xuất)**: Tạo thêm field `settlementInfo` trong model `Event` hiện tại để tránh thêm model mới.  
> - **Option B**: Tạo một model `SettlementLog` riêng để quản lý lịch sử tất toán độc lập.  
> 
> Mình sẽ dùng **Option A** vì tất toán là 1-1 với event, không cần bảng riêng.

> [!IMPORTANT]
> **Địa chỉ `adminTreasury` để xác định log USDT?**  
> Khi parse `Transfer` logs trong receipt, cần biết địa chỉ `adminTreasury` trên smart contract để xác định log nào dành cho Admin. Địa chỉ này cần được lấy từ:
> - Gọi `contract.adminTreasury()` trước khi `claimFunds`, hoặc
> - Hardcode vào FE constants.  
> 
> Mình sẽ **gọi `contract.adminTreasury()` read-only** trước khi claim để đảm bảo đúng địa chỉ.

> [!IMPORTANT]
> **`onChainEventId` là gì?**  
> Hàm `claimFunds(uint256 eventId)` trên smart contract nhận vào **on-chain eventId** (số `onChainId`), không phải MongoDB `_id`. Trong hệ thống hiện tại, `onChainId` được lưu trong từng `TicketType`. Cần fetch `onChainId` từ dashboard overview hoặc từ một API riêng để truyền vào hàm `claimFunds`.  
> 
> **Giải pháp**: Thêm `onChainEventId` vào response của `getDashboardOverview` (lấy từ `TicketType` đầu tiên của event).

---

## Proposed Changes

### 1. Backend — Model & API

---

#### [MODIFY] [event.js](file:///e:/KHÓA%20LUẬN%20TỐT%20NGHIỆP/DA2_KL_BE/models/event.js)
Thêm field `settlementInfo` vào schema để lưu thông tin tất toán:
```js
settlementInfo: {
  txHash: { type: String },
  settledAt: { type: Date },
  organizerAmount: { type: Number },   // Số USDT (chia 6 decimals) organizer nhận
  adminAmount: { type: Number },        // Số USDT admin nhận
  organizerAddress: { type: String },   // Địa chỉ ví organizer
  adminTreasuryAddress: { type: String },
}
```
Đồng thời thêm `"settled"` vào danh sách `status.enum` (đã có sẵn ✅).

---

#### [MODIFY] [adminEventService.js](file:///e:/KHÓA%20LUẬN%20TỐT%20NGHIỆP/DA2_KL_BE/services/adminEventService.js)
Thêm function `settleEvent(eventId, settlementData)`:
- Kiểm tra event tồn tại và status = `"completed"`.
- Cập nhật `status = "settled"` và lưu `settlementInfo`.
- Gửi notification cho organizer.

Thêm `onChainEventId` vào response của `getEventById` (lấy `onChainId` từ TicketType đầu tiên liên kết với event).

---

#### [MODIFY] [adminEvent.controller.js](file:///e:/KHÓA%20LUẬN%20TỐT%20NGHIỆP/DA2_KL_BE/controllers/adminEvent.controller.js)
Thêm handler `handleSettleEvent`:
```
POST /api/admin/events/:id/settle
Body: { txHash, organizerAmount, adminAmount, organizerAddress, adminTreasuryAddress }
```

---

#### [MODIFY] [adminEvent.routes.js](file:///e:/KHÓA%20LUẬN%20TỐT%20NGHIỆP/DA2_KL_BE/routes/adminEvent.routes.js)
Thêm route:
```
router.post("/:id/settle", userExtractor, requireAdmin, handleSettleEvent);
```

---

### 2. Frontend — Hook & Service

---

#### [NEW] useClaimFundsWeb3.jsx
`e:\KHÓA LUẬN TỐT NGHIỆP\DA2_KL_FE\src\hooks\useClaimFundsWeb3.jsx`

Hook tương tác với smart contract theo luồng:
1. Kiểm tra ví / kết nối MetaMask
2. Chuyển đúng mạng (Polygon Amoy)
3. Gọi `contract.adminTreasury()` để lấy địa chỉ treasury (read-only, không tốn gas)
4. Gọi `claimFunds(onChainEventId)` với gas options cứng 30 Gwei
5. Đợi receipt
6. Parse `receipt.logs` tìm Transfer events từ USDT contract:
   - Log nào có `to == signerAddress` → `netRevenue` (tiền organizer)
   - Log nào có `to == adminTreasury` → `totalDeduction` (tiền admin)
7. Trả về `{ txHash, organizerAmount, adminAmount, organizerAddress, adminTreasuryAddress }`

---

#### [MODIFY] [adminService.js](file:///e:/KHÓA%20LUẬN%20TỐT%20NGHIỆP/DA2_KL_FE/src/services/adminService.js)
Thêm function `settleEvent(eventId, settlementData)` gọi `POST /api/admin/events/:id/settle`.

---

#### [MODIFY] [eventService.js](file:///e:/KHÓA%20LUẬN%20TỐT%20NGHIỆP/DA2_KL_FE/src/services/eventService.js)
Đảm bảo `getDashboardOverview` trả về `onChainEventId` (nếu BE đã thêm).

---

### 3. Frontend — UI

---

#### [MODIFY] [AdminEventDetailPage.jsx](file:///e:/KHÓA%20LUẬN%20TỐT%20NGHIỆP/DA2_KL_FE/src/pages/admin/AdminEventDetailPage.jsx)

**Thay đổi chính:**
- Thêm `settled` vào `getStatusInfo()` (badge màu tím/violet).
- **Nút "Tất toán"**: Chỉ hiển thị khi `status === "completed"`, ẩn khi `status === "settled"`.
- Khi confirm modal → gọi hook `useClaimFundsWeb3` → sau khi nhận kết quả → gọi `settleEvent` để lưu DB → `invalidateQueries` để refetch.
- **Settlement Info Card**: Hiển thị khi `status === "settled"`:
  - txHash (link đến Polygonscan Amoy)
  - Ngày giờ tất toán
  - Số tiền Organizer nhận (USDT)
  - Số tiền Admin nhận (USDT)
  - Địa chỉ ví các bên

---

## Luồng Tổng Quan

```
Admin bấm "Tất toán"
     ↓
ConfirmModal → handleSettleEvent()
     ↓
[useClaimFundsWeb3]
  1. Kết nối ví / chuyển mạng
  2. contract.adminTreasury() → adminTreasuryAddr
  3. contract.claimFunds(onChainEventId)
  4. await receipt
  5. Parse Transfer logs từ USDT contract
     → organizerAmount (to == signer)
     → adminAmount (to == adminTreasury)
     ↓
[adminService.settleEvent()]
  POST /api/admin/events/:id/settle
  { txHash, organizerAmount, adminAmount, ... }
     ↓
[BE: adminEventService.settleEvent()]
  event.status = "settled"
  event.settlementInfo = { ... }
  await event.save()
     ↓
[FE: invalidateQueries → refetch]
  Hiển thị Settlement Info Card
```

---

## Verification Plan

### Backend
- Gọi `POST /api/admin/events/:id/settle` với mock data → kiểm tra DB có `status=settled` và `settlementInfo` đúng.
- Kiểm tra event không phải `completed` → trả 400.

### Frontend
- Kiểm tra nút "Tất toán" chỉ hiện khi `completed`.
- Kiểm tra nút "Tất toán" ẩn khi `settled`.
- Verify Settlement Info Card hiển thị đúng thông tin.
- Verify link txHash mở đúng Polygonscan Amoy.
