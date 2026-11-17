// go.mod: Projemizin "Reçetesi"dir.
// Hangi kütüphanelerin, hangi versiyonlarının kullanılacağını belirler.
// Benzer dillerdeki karşılığı: package.json (Node.js), requirements.txt (Python), pom.xml (Java).
module go-agent

// -------------------------------------------------------------------------
// go.sum DOSYASI HAKKINDA:
// Bu dosya (go.sum), indirilen kütüphanelerin "Parmak İzi"ni (Checksum/Hash) tutar.
// AMACI: Güvenliktir. Kütüphanenin içeriğinin sonradan değişmediğini veya hacklenmediğini doğrular.
// O dosya otomatiktir, elle değiştirilmez ve yorum satırı desteklemez.
// -------------------------------------------------------------------------

go 1.21

require github.com/gorilla/websocket v1.5.0
