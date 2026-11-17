package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// Secret key for signing tokens (In production, use environment variables!)
var jwtKey = []byte("my_secret_key")

// Credentials represents the login data
type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Claims represents the JWT claims
// Claims: JWT Token'ın içinde taşıyacağı bilgiler (Payload).
type Claims struct {
	Username             string `json:"username"` // Bizim eklediğimiz özel bilgi
	jwt.RegisteredClaims        // Standart JWT bilgileri (Süre, Veren kişi vb.)
}

// Annotation represents the structure of the data sent from the frontend
// Annotation: Veritabanında saklanacak olan "Kutucuk" modelidir.
// gorm.Model: İçinde ID, CreatedAt, UpdatedAt, DeletedAt alanlarını hazır getirir.
type Annotation struct {
	gorm.Model         // GORM'un standart alanlarını (ID, tarihler) ekler.
	ImageID    string  `json:"imageId"` // Hangi resme ait olduğunu tutar.
	Label      string  `json:"label"`   // Etiket (örn: "Araba", "İnsan")
	X          float64 `json:"x"`       // X Koordinatı
	Y          float64 `json:"y"`       // Y Koordinatı
	Width      float64 `json:"width"`   // Genişlik
	Height     float64 `json:"height"`  // Yükseklik
}

// db: Veritabanı bağlantımızı tutan global değişken.
// Başta boştur, main() fonksiyonunda doldurulur.
var db *gorm.DB

// Login Handler
// loginHandler: Kullanıcının giriş yapmasını sağlayan fonksiyondur.
func loginHandler(w http.ResponseWriter, r *http.Request) {
	// CORS
	// CORS: Tarayıcı güvenliği için ön izin veriyoruz (React ile konuşabilmek için).
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Eğer istek OPTIONS ise (Ön kontrol), sadece "OK" deyip dönüyoruz.
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Sadece POST metoduyla giriş kabul ediyoruz.
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Frontend'den gelen JSON verisini okuyup 'creds' değişkenine dolduruyoruz.
	var creds Credentials
	err := json.NewDecoder(r.Body).Decode(&creds)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest) // JSON bozuksa 400 hatası dön.
		return
	}

	// Hardcoded check (admin/12345)
	// Şifre Kontrolü (Basitçe "admin" ve "12345" mı diye bakıyoruz)
	// Gerçek hayatta burada veritabanından şifre kontrolü yapılır.
	if creds.Username != "admin" || creds.Password != "12345" {
		w.WriteHeader(http.StatusUnauthorized) // Şifre yanlışsa 401 hatası dön.
		return
	}

	// Create JWT
	// Token Oluşturma Aşaması
	// Bitiş süresi: Şimdiki zaman + 48 saat (Sunum ve testler için uzatıldı)
	expirationTime := time.Now().Add(48 * time.Hour)
	claims := &Claims{
		Username: creds.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	// Token'ı gizli anahtarımızla imzalıyoruz (Mühürlüyoruz).
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	// Return Token
	// Oluşan Token'ı JSON olarak kullanıcıya gönderiyoruz.
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"token": tokenString,
	})
}

// Auth Middleware
// authMiddleware: Bir güvenlik görevlisi gibi çalışır.
// Asıl fonksiyondan (next) önce çalışır, Token var mı diye bakar.
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// CORS for Preflight (Middleware runs before handler, so we need this here too or handle it globally)
		// CORS izinleri (Token başlığına izin veriyoruz)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization") // Allow Authorization header

		// Ön kontrol (OPTIONS) isteği ise geçiş izni ver.
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Get Token from Header
		// Header'dan "Authorization" bilgisini al.
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header missing", http.StatusUnauthorized)
			return
		}

		// Format: "Bearer <token>"
		// "Bearer <token>" formatından sadece token kısmını ayır.
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			http.Error(w, "Invalid token format", http.StatusUnauthorized)
			return
		}

		// Parse Token
		// Token'ı doğrula (Bizim anahtarla mı imzalanmış?)
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		// Token is valid, proceed
		// Her şey yolundaysa asıl fonksiyona devam et.
		next(w, r)
	}
}

// annotationsHandler: Veritabanına yazma (POST) ve okuma (GET) işlerini yapar.
func annotationsHandler(w http.ResponseWriter, r *http.Request) {
	// CORS headers are already set by middleware, but good practice to ensure
	// CORS ayarı
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// --- OKUMA İŞLEMİ (GET) ---
	if r.Method == http.MethodGet {
		imageID := r.URL.Query().Get("imageID") // URL'den resim adını al
		if imageID == "" {
			http.Error(w, "Missing imageID query parameter", http.StatusBadRequest)
			return
		}

		// Veritabanından o resme ait kutuları bul
		var annotations []Annotation
		if err := db.Where("image_id = ?", imageID).Find(&annotations).Error; err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}

		// Bulunanları JSON olarak gönder
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(annotations)
		return
	}

	// --- YAZMA İŞLEMİ (POST) ---
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Gelen JSON verisini oku
	var annotations []Annotation
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&annotations); err != nil {
		// Try deleting single object if array fails?
		// But user said "Usually frontend sends the whole list".
		// Let's assume list for now as per instructions.
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		log.Println("JSON Decode Error:", err)
		return
	}

	if len(annotations) == 0 {
		// Nothing to save, but maybe we should clear existing for this image?
		// If we don't know the imageID, we can't clear.
		// Assuming frontend sends at least one empty annotation or we handle this logic.
		// If list is empty, we do nothing or return success.
		w.WriteHeader(http.StatusOK)
		return
	}

	// We assume all annotations in the batch belong to the SAME image.
	// We take the ImageID from the first one.
	// Resim adını ilk kutudan al
	imageID := annotations[0].ImageID
	if imageID == "" {
		http.Error(w, "Missing imageID in payload", http.StatusBadRequest)
		return
	}

	// Sanitize Data: Reset IDs to 0 to ensure DB generates new unique Primary Keys
	// The frontend sends local IDs (1, 2, 3...) which causes conflicts.
	// Veri Temizliği: ID'leri sıfırla ki DB çakışması olmasın.
	// Frontend "1, 2, 3" gibi geçici ID yollar, biz bunları "0" yapıp DB'ye
	// "Sen kendi ID'ni kendin ver" diyoruz.
	for i := range annotations {
		annotations[i].ID = 0
	}

	// Transaction: Delete old -> Create new
	// TRANSACTION (Atomik İşlem): "Ya hep ya hiç"
	// Önce eskileri sil, sonra yenileri ekle.
	err := db.Transaction(func(tx *gorm.DB) error {
		// 1. Delete existing for this image
		// 1. Bu resme ait eski kayıtları sil
		if err := tx.Where("image_id = ?", imageID).Delete(&Annotation{}).Error; err != nil {
			return err
		}
		// 2. Create new from the list
		// 2. Yeni listeyi veritabanına ekle
		if err := tx.Create(&annotations).Error; err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		log.Println("Transaction Error:", err)
		http.Error(w, "Failed to save annotations", http.StatusInternalServerError)
		return
	}

	fmt.Printf("Saved %d annotations for image: %s\n", len(annotations), imageID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "saved",
		"message": "Annotations received and saved successfully",
	})
}

// imagesHandler: Scans the dataset directory and returns a JSON list of available images
func imagesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	datasetDir := "/home/furkanb/Documents/Annotation/Hard Hat Detection.yolov8/train/images"
	files, err := os.ReadDir(datasetDir)
	if err != nil {
		http.Error(w, "Failed to read dataset directory", http.StatusInternalServerError)
		return
	}

	type ImageInfo struct {
		Filename   string `json:"filename"`
		Title      string `json:"title"`
		Size       string `json:"size"`
		Resolution string `json:"resolution"`
	}

	var images []ImageInfo
	count := 0
	for _, file := range files {
		if file.IsDir() {
			continue
		}
		name := file.Name()
		lowerName := strings.ToLower(name)
		if strings.HasSuffix(lowerName, ".png") || strings.HasSuffix(lowerName, ".jpg") || strings.HasSuffix(lowerName, ".jpeg") {
			info, err := file.Info()
			sizeStr := "Unknown"
			if err == nil {
				sizeStr = fmt.Sprintf("%.1f MB", float64(info.Size())/(1024*1024))
			}
			title := fmt.Sprintf("Baret Kontrol - Resim %d", count+1)
			images = append(images, ImageInfo{
				Filename:   name,
				Title:      title,
				Size:       sizeStr,
				Resolution: "640x640",
			})
			count++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(images)
}

// annotatedImagesHandler returns a list of filenames that have at least one annotation in the DB
func annotatedImagesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	var imageIDs []string
	db.Model(&Annotation{}).Distinct("image_id").Pluck("image_id", &imageIDs)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(imageIDs)
}

func main() {
	// Database Init
	// Veritabanını Başlat (annotations.db dosyasını açar)
	var err error
	db, err = gorm.Open(sqlite.Open("annotations.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("failed to connect database")
	}

	// Auto Migrate
	// Tabloları Oluştur (Auto Migrate)
	// Annotation struct'ına bakarak veritabanında tabloyu oluşturur/günceller.
	db.AutoMigrate(&Annotation{})

	// Root handler for health check
	// Root Handler: Anasayfa isteği gelirse mesaj dön.
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Cloud Backend is running! 🚀"))
	})

	// Rotaları Tanımla
	http.HandleFunc("/login", loginHandler)
	// Protect the annotations endpoint
	// /api/annotations rotasını "authMiddleware" ile korumaya alıyoruz.
	http.HandleFunc("/api/annotations", authMiddleware(annotationsHandler))
	
	// Dynamic images API
	http.HandleFunc("/api/images", imagesHandler)
	http.HandleFunc("/api/annotated-images", annotatedImagesHandler)

	port := ":3000"
	fmt.Printf("Cloud Backend (Go + GORM + SQLite) running at http://localhost%s\n", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal(err)
	}
}
