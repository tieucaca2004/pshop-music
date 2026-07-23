@echo off
setlocal enabledelayedexpansion
set "msg=Nấm Đông Cô - siêu thực phẩm từ thiên nhiên. Bạn có biết nấm đông cô là một trong những nguyên liệu giàu dinh dưỡng nhất trong các món xào tại quán? Nấm đông cô có vị ngọt tự nhiên, dai giòn đặc trưng. Vitamin D - nấm đông cô là một trong số ít thực vật có vitamin D tự nhiên. Beta-glucan - kích thích miễn dịch, chống viêm. Vitamin nhóm B - hỗ trợ trao đổi chất. Chất xơ - tiêu hóa tốt. Ít calo - chỉ 35 calo/100g. #NamDongCo #GiaTriDinhDuong #ATieu #HuTieuXao #AmThucDuongPho"
set "tok=EAAdf6Le4TlABSCdIbDWEkJn1y5cvTPZAWWrDss7OF1J1g5Gcu6dJZAgXVQw3u0AtrpTRlvZBbobGwlLZCeQ4WwSRgZAkwlZA7thQLTddoAXNNZBlXAzBJnfKjZC1Lp5JsEcoag5PqyVdhF0tJcvPO0bPVT69sS7QhFpNK9nkXXAsbHk3AmL43GH2lRyQLHtu7ojVJmDOiinkbwZCRx1u3phBzDWueuvEvHEe7tMHqHcFhZBZBNawPqihYbZCQSUZD"
curl -s -X POST "https://graph.facebook.com/v19.0/109215528208008/feed" -d "message=%msg%" -d "access_token=%tok%"
