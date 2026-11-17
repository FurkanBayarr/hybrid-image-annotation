package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gorilla/websocket"
)

// upgrader: HTTP bağlantısını WebSocket bağlantısına yükseltmek (upgrade) için kullanılır.
// WebSocket normal HTTP'den farklı olarak çift yönlü ve sürekli açık bir iletişim kanalıdır.
// upgrader: HTTP bağlantısını WebSocket bağlantısına yükseltmek (upgrade) için kullanılan bir configuration struct'ıdır (yapı).
// Bu bir "metot" değil, bir "NESNE"dir. İçinde ayarları tutar.
// Ancak bu nesnenin .Upgrade() adında bir metodu vardır ve asıl işi o yapar.
var upgrader = websocket.Upgrader{
	// ReadBufferSize ve WriteBufferSize: WebSocket'in veri okuma/yazma tampon bellek boyutları (byte cinsinden).
	// Varsayılan değerler (0) genellikle yeterlidir (genelde 4096 byte).
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,

	// CheckOrigin: Güvenlik ayarıdır. Tarayıcıdan gelen isteğin hangi siteden geldiğini kontrol eder.
	// Normalde "Same Origin Policy" gereği farklı domainler engellenir.
	// Biz geliştirme ortamında (localhost) olduğumuz için herkese (return true) izin veriyoruz.
	CheckOrigin: func(r *http.Request) bool {
		return true // CORS (Cross-Origin Resource Sharing) izni: Her yerden gelen isteği kabul et.
	},
}

// streamHandler: '/stream' adresine gelen her istekte bu fonksiyon çalışır.
func streamHandler(w http.ResponseWriter, r *http.Request) {
	// 1. ADIM: Bağlantıyı Yükseltme (Handshake)
	// Gelen HTTP isteğini WebSocket protokolüne çeviriyoruz.
	// Artık 'conn' nesnesi üzerinden veri alışverişi yapabiliriz.
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade hatası:", err)
		return
	}
	// Fonksiyon bittiğinde (return olduğunda) bağlantıyı kapatmayı garanti eder.
	defer conn.Close()

	log.Println("İstemci (Client) bağlandı")

	// 2. ADIM: Dosyayı Okuma
	// URL'den 'file' parametresini al (örn: ?file=hard_hat_workers...)
	filename := r.URL.Query().Get("file")
	if filename == "" {
		filename = "test.jpg" // Varsayılan
	}

	log.Printf("İstenen dosya: %s", filename)

	datasetDir := "/home/furkanb/Documents/Annotation/Hard Hat Detection.yolov8/train/images"
	filePath := filepath.Join(datasetDir, filename)

	// Sunucunun çalıştığı klasördeki dosyayı diskten RAM'e okuyoruz.
	// 'imageData' değişkeni resmin tüm baytlarını (binary data) tutar.
	imageData, err := os.ReadFile(filePath)
	if err != nil {
		log.Println("Dosya okuma hatası:", err)
		// Eğer dosya yoksa, istemciye hata mesajı gönderiyoruz.
		conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Hata: %s okunamadı", filename)))
		return
	}

	// 3. ADIM: Veriyi Gönderme
	// Okuduğumuz resim verisini (byte array) WebSocket tünelinden karşı tarafa fırlatıyoruz.
	// BinaryMessage tipi, gönderdiğimiz verinin metin değil, ham veri (resim, video vb.) olduğunu belirtir.
	err = conn.WriteMessage(websocket.BinaryMessage, imageData)
	if err != nil {
		log.Println("Yazma hatası:", err)
		return
	}

	log.Println("Resim başarıyla gönderildi")

	// Not: Bu noktada fonksiyon bitiyor.
	// 'defer conn.Close()' devreye girip bağlantıyı kapatacak.
	// İstemci tarafında (React) 'onclose' eventi tetiklenecek.
}

func main() {
	// '/stream' adresine gelen istekleri 'streamHandler' fonksiyonuna yönlendir.
	http.HandleFunc("/stream", streamHandler)

	port := ":8080"
	fmt.Printf("Sunucu %s portunda başlatılıyor...\n", port)

	// Sunucuyu başlat ve dinlemeye geç.
	// Bu komut programı sürekli çalışır halde tutar (infinite loop gibi).
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal("Sunucu hatası:", err)
	}
}
