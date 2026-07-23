$token = "EAAdf6Le4TlABSCdIbDWEkJn1y5cvTPZAWWrDss7OF1J1g5Gcu6dJZAgXVQw3u0AtrpTRlvZBbobGwlLZCeQ4WwSRgZAkwlZA7thQLTddoAXNNZBlXAzBJnfKjZC1Lp5JsEcoag5PqyVdhF0tJcvPO0bPVT69sS7QhFpNK9nkXXAsbHk3AmL43GH2lRyQLHtu7ojVJmDOiinkbwZCRx1u3phBzDWueuvEvHEe7tMHqHcFhZBZBNawPqihYbZCQSUZD"
$pageId = "109215528208008"
$imagePath = "D:\PshopMusicSite\media\inbound\openclaw-staged-28a4eb74-60f1-4add-83f6-2d2b0225e603\f26ca196-c637-4256-9d62-7357ad1afce8.jpg"
$message = @"
Nấm Đông Cô - siêu thực phẩm từ thiên nhiên

Bạn có biết nấm đông cô là một trong những nguyên liệu giàu dinh dưỡng nhất trong các món xào tại quán?

Nấm đông cô có vị ngọt tự nhiên, dai giòn đặc trưng khi xào cùng rau củ. Không chỉ thơm ngon, loại nấm này còn mang lại nhiều lợi ích sức khỏe đáng kinh ngạc.

Vitamin D - nấm đông cô là một trong số ít thực vật có vitamin D tự nhiên nhờ quá trình phơi nắng. Vitamin D giúp xương chắc khỏe và tăng cường sức đề kháng.

Beta-glucan - hợp chất quý trong nấm giúp kích thích hệ miễn dịch tự nhiên, chống viêm và chống oxy hóa hiệu quả.

Vitamin nhóm B - nấm đông cô giàu vitamin B6 và B5, hỗ trợ trao đổi chất, chuyển hóa thức ăn thành năng lượng, giảm mệt mỏi.

Chất xơ - giúp hệ tiêu hóa hoạt động tốt, tạo cảm giác no lâu, hỗ trợ kiểm soát cân nặng hiệu quả.

Ít calo - chỉ khoảng 35 calo mỗi 100g, gần như không có chất béo. Món xào nấm thanh nhẹ, phù hợp cho người ăn kiêng và người muốn duy trì vóc dáng.

Kali và Đồng - kali giúp điều hòa huyết áp. Đồng hỗ trợ tạo hồng cầu và duy trì hệ thần kinh khỏe mạnh.

Nấm đông cô xào cùng rau củ tươi là sự kết hợp hoàn hảo giữa hương vị và dinh dưỡng. Món ăn thanh đạm, phù hợp mọi lứa tuổi.

#NamDongCo #GiaTriDinhDuong #Sickhoe #DinhDuong #AmThuc #MonNgon #RauXao
"@

try {
    # Use curl.exe for multipart upload - save message to temp file first
    $msgFile = [System.IO.Path]::GetTempFileName() + ".txt"
    [System.IO.File]::WriteAllText($msgFile, $message, [System.Text.Encoding]::UTF8)
    
    $result = & curl.exe -s -X POST "https://graph.facebook.com/v19.0/$pageId/photos" `
        --data-urlencode "message@$msgFile" `
        -F "source=@$imagePath" `
        -F "access_token=$token"
    
    Write-Host $result
    
    Remove-Item $msgFile -ErrorAction SilentlyContinue
}
catch {
    Write-Host "Error: $($_.Exception.Message)"
}
