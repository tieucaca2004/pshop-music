@echo off
set TOKEN=EAAdf6Le4TlABSCdIbDWEkJn1y5cvTPZAWWrDss7OF1J1g5Gcu6dJZAgXVQw3u0AtrpTRlvZBbobGwlLZCeQ4WwSRgZAkwlZA7thQLTddoAXNNZBlXAzBJnfKjZC1Lp5JsEcoag5PqyVdhF0tJcvPO0bPVT69sS7QhFpNK9nkXXAsbHk3AmL43GH2lRyQLHtu7ojVJmDOiinkbwZCRx1u3phBzDWueuvEvHEe7tMHqHcFhZBZBNawPqihYbZCQSUZD
set PAGE_ID=109215528208008
set IMAGE=D:\PshopMusicSite\media\inbound\openclaw-staged-28a4eb74-60f1-4add-83f6-2d2b0225e603\f26ca196-c637-4256-9d62-7357ad1afce8.jpg
set MSG=Nấm Đông Cô - siêu thực phẩm từ thiên nhiên. Bạn có biết nấm đông cô là một trong những nguyên liệu giàu dinh dưỡng nhất? Vitamin D, Beta-glucan, Vitamin B, chất xơ. Chỉ 35 calo/100g. #NamDongCo #ATieu #HuTieuXao
curl -s -X POST "https://graph.facebook.com/v19.0/%PAGE_ID%/photos" -F "message=%MSG%" -F "source=@%IMAGE%" -F "access_token=%TOKEN%"
