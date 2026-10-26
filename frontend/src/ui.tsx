import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { X, ChevronDown, Info, Check, Undo2 } from "lucide-react";

/* ---------- i18n ---------- */
export type Lang = "en" | "tr";
export const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "en",
  setLang: () => {},
});
const TR: Record<string, string> = {
  "Skip to content": "İçeriğe geç",
  "Main navigation": "Ana gezinme",
  Progress: "İlerleme",
  "Saving your changes…": "Değişikliklerin kaydediliyor…",
  Filter: "Filtre",
  "Loading your SpendSense data...": "SpendSense verilerin yükleniyor...",
  "Reload my data": "Verilerimi yeniden yükle",
  "This screen could not load. Reconnect and reload SpendSense.":
    "Bu ekran yüklenemedi. Bağlantı kurup SpendSense'i yeniden yükle.",
  "Reloading discards unsaved inputs. Saved information stays in your account.":
    "Yeniden yükleme, kaydedilmemiş girişleri siler. Kayıtlı bilgilerin hesabında kalır.",
  "Restoring your session...": "Oturumun geri yükleniyor...",
  "Your session could not be restored. Please log in again.":
    "Oturumun geri yüklenemedi. Lütfen yeniden giriş yap.",
  "Could not restore your session. Check your connection.":
    "Oturumun geri yüklenemedi. Bağlantını kontrol et.",
  "Could not log out. Check your connection and try again.":
    "Çıkış yapılamadı. Bağlantını kontrol et ve tekrar dene.",
  "Some data was incomplete or invalid. Reload your saved data before trying again.":
    "Bazı veriler eksik veya geçersiz. Tekrar denemeden önce kayıtlı verilerini yeniden yükle.",
  "Your changes could not be saved. Check your connection and try again. No success was recorded.":
    "Değişikliklerin kaydedilemedi. Bağlantını kontrol et ve tekrar dene. İşlem başarılı olarak gösterilmedi.",
  "Your session could not access this data. Please sign in again.":
    "Oturumun bu verilere erişemedi. Lütfen yeniden giriş yap.",
  "Enter your password.": "Şifreni gir.",
  "Your financial data is saved securely to your account.":
    "Finansal verilerin hesabına güvenli şekilde kaydedilir.",
  "Use at least 8 characters for a new password.": "Yeni şifre için en az 8 karakter kullan.",
  "Check your email to confirm your account, then log in.":
    "Hesabını doğrulamak için e-postanı kontrol et, ardından giriş yap.",
  "Email or password is incorrect.": "E-posta veya şifre hatalı.",
  "Confirm your email before logging in.": "Giriş yapmadan önce e-postanı doğrula.",
  "Choose a stronger password with at least 8 characters.":
    "En az 8 karakter içeren daha güçlü bir şifre seç.",
  "Too many attempts. Please wait a moment and try again.":
    "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.",
  "Could not sign in or register. Check your details and try again.":
    "Giriş veya kayıt tamamlanamadı. Bilgilerini kontrol edip tekrar dene.",
  "Could not reach SpendSense. Check your connection and try again.":
    "SpendSense'e ulaşılamadı. Bağlantını kontrol edip tekrar dene.",
  "Please log in before continuing.": "Devam etmeden önce giriş yap.",
  "Signing in...": "Giriş yapılıyor...",
  "Saving...": "Kaydediliyor...",
  "This deletes your saved entries, goals, analyses and decisions. It cannot be undone.":
    "Kaydedilen kayıtların, hedeflerin, analizlerin ve kararların silinir. Bu işlem geri alınamaz.",
  Home: "Ana Sayfa",
  Money: "Para",
  Decide: "Karar",
  Goals: "Hedefler",
  Insights: "İçgörüler",
  More: "Daha fazla",
  "Waiting List": "Bekleme Listesi",
  History: "Geçmiş",
  Settings: "Ayarlar",
  "Get started": "Başlayalım",
  "Log in": "Giriş yap",
  Back: "Geri",
  Next: "İleri",
  Cancel: "Vazgeç",
  Save: "Kaydet",
  Edit: "Düzenle",
  Delete: "Sil",
  Undo: "Geri al",
  Close: "Kapat",
  Skip: "Atla",
  Confirm: "Onayla",
  Done: "Tamam",
  "Pause. Reflect. Decide.": "Dur. Düşün. Karar ver.",
  "Track your money and get calm context before you buy. The decision always stays yours.":
    "Paranı takip et, almadan önce sakin bir bağlam gör. Karar her zaman senin.",
  "Track income & expenses": "Gelir ve giderleri takip et",
  "Reflect before you buy": "Almadan önce düşün",
  "No judgment": "Yargı yok",
  "You stay in control": "Kontrol sende",
  "No points, no streaks": "Puan yok, seri yok",
  "Hi! I'm Blob. I'll keep you company with your money.":
    "Merhaba! Ben Blob. Paranla ilgili sana eşlik edeceğim.",
  "SpendSense gives you context. You make the decision.":
    "SpendSense bağlam sunar. Kararı sen verirsin.",
  Welcome: "Hoş geldin",
  "Create your account": "Hesabını oluştur",
  "Prototype: data stays in this browser only.": "Prototip: veriler yalnızca bu tarayıcıda kalır.",
  Email: "E-posta",
  Password: "Şifre",
  "Show password": "Şifreyi göster",
  "Hide password": "Şifreyi gizle",
  "That email looks incomplete — try name@example.com.":
    "E-posta eksik görünüyor — ad@ornek.com gibi dene.",
  "Passwords need at least 6 characters.": "Şifre en az 6 karakter olmalı.",
  "Roughly how much comes in each month?": "Ayda kabaca ne kadar gelir giriyor?",
  "And how much do you usually set aside?": "Peki genelde ne kadar biriktiriyorsun?",
  None: "Hiç",
  "When you see something you like…": "Beğendiğin bir şey görünce…",
  "Buy it soon": "Hemen alırım",
  "Think it over": "Düşünürüm",
  "Compare prices": "Fiyat karşılaştırırım",
  "How often do discounts tempt you?": "İndirimler seni ne sıklıkla cezbeder?",
  Often: "Sık",
  Sometimes: "Bazen",
  Rarely: "Nadiren",
  "Treating yourself after a hard day?": "Zor bir günün ardından kendini ödüllendirir misin?",
  Usually: "Genelde",
  "How much do friends shape what you buy?": "Arkadaşların aldıklarını ne kadar etkiler?",
  "Quite a bit": "Epey",
  "A little": "Biraz",
  "Not really": "Pek değil",
  "Your spending style": "Harcama tarzın",
  "A reflection of your answers, not a label. It can change anytime.":
    "Cevaplarının bir yansıması, bir etiket değil. Her zaman değişebilir.",
  "Quick decisions": "Hızlı karar verme",
  "Planning ahead": "Önceden planlama",
  "Drawn to discounts": "İndirimlere ilgi",
  "Treating yourself": "Kendini ödüllendirme",
  "Influenced by friends": "Arkadaş etkisi",
  "Pick one to continue.": "Devam etmek için birini seç.",
  "Step {n} of {t}": "Adım {n} / {t}",
  "Let's go": "Hadi başlayalım",
  "Quick add": "Hızlı ekle",
  "Should I buy it?": "Alsam mı?",
  "Add your income and expenses in two taps.": "Gelir ve giderini iki dokunuşla ekle.",
  "Thinking about a purchase? Get context here.":
    "Bir alışveriş mi düşünüyorsun? Bağlamı burada gör.",
  "Track what you are saving toward.": "Neye biriktirdiğini takip et.",
  "Skip tour": "Turu atla",
  "Hi there! Let's look at your month together.": "Merhaba! Bu ayına birlikte bakalım.",
  "Left this month": "Bu ay kalan",
  Income: "Gelir",
  Expense: "Gider",
  Expenses: "Giderler",
  Spent: "Harcanan",
  "Recent entries": "Son kayıtlar",
  "See all": "Tümü",
  "Up for review": "Gözden geçirilecek",
  "Ready to revisit": "Tekrar bakmaya hazır",
  "Review on {d}": "{d} tarihinde bak",
  Today: "Bugün",
  Yesterday: "Dün",
  All: "Tümü",
  "All categories": "Tüm kategoriler",
  "Nothing here yet. Want to start together?": "Henüz bir şey yok. Birlikte başlayalım mı?",
  "Add entry": "Kayıt ekle",
  "Edit entry": "Kaydı düzenle",
  Amount: "Tutar",
  Category: "Kategori",
  "Note (optional)": "Not (isteğe bağlı)",
  "Enter an amount above zero.": "Sıfırdan büyük bir tutar gir.",
  "Pick a category.": "Bir kategori seç.",
  "Entry saved.": "Kayıt eklendi.",
  "Entry updated.": "Kayıt güncellendi.",
  "Entry deleted.": "Kayıt silindi.",
  "All set! I've added that to your month.": "Tamamdır! Bunu ayına ekledim.",
  "Not bought yet? Check it first.": "Henüz almadın mı? Önce bir bak.",
  Food: "Yemek",
  Transport: "Ulaşım",
  Shopping: "Alışveriş",
  Bills: "Faturalar",
  Fun: "Eğlence",
  Health: "Sağlık",
  Other: "Diğer",
  Salary: "Maaş",
  "Side income": "Ek gelir",
  Gift: "Hediye",
  What: "Ne?",
  Why: "Neden?",
  Feeling: "His",
  Own: "Var mı?",
  Wait: "Bekle",
  "Let's add a little context first.": "Önce biraz bağlam ekleyelim.",
  "What are you thinking of buying?": "Ne almayı düşünüyorsun?",
  "Product name": "Ürün adı",
  Price: "Fiyat",
  "Why do you want it?": "Neden istiyorsun?",
  "Pick any that fit.": "Uyanları seç.",
  need: "İhtiyacım var",
  wanted: "Bir süredir istiyorum",
  sale: "İndirimde",
  easier: "Bir şeyi kolaylaştırır",
  social: "Arkadaş çevresi",
  reward: "Kendimi ödüllendirmek",
  attention: "Gözüme çarptı",
  other: "Diğer",
  "How are you feeling right now?": "Şu an nasıl hissediyorsun?",
  Calm: "Sakin",
  Excited: "Heyecanlı",
  Stressed: "Stresli",
  Bored: "Sıkılmış",
  Tired: "Yorgun",
  Neutral: "Nötr",
  "Do you already have something similar?": "Benzer bir şeyin zaten var mı?",
  Yes: "Evet",
  No: "Hayır",
  "Is it still usable?": "Hâlâ kullanılabilir mi?",
  "How long could you wait?": "Ne kadar bekleyebilirsin?",
  "24 hours": "24 saat",
  "3 days": "3 gün",
  "1 week": "1 hafta",
  "Add a name and a price above zero.": "Bir ad ve sıfırdan büyük fiyat ekle.",
  "Choose at least one reason.": "En az bir neden seç.",
  "Choose how you feel.": "Nasıl hissettiğini seç.",
  "Answer to continue.": "Devam etmek için cevapla.",
  Analyze: "Analiz et",
  "Looking at your context…": "Bağlamına bakıyorum…",
  "Here's the context. It's your call.": "İşte bağlam. Karar senin.",
  "Overall fit": "Genel uyum",
  "Higher means more aligned with your current context.":
    "Yüksek değer, mevcut durumunla daha uyumlu demek.",
  "Budget fit": "Bütçe uyumu",
  "Need level": "İhtiyaç düzeyi",
  "Goal impact": "Hedef etkisi",
  "Impulse signals": "Anlık istek sinyalleri",
  High: "Yüksek",
  Medium: "Orta",
  Low: "Düşük",
  "Higher is better.": "Yüksek olması iyi.",
  "Higher means a stronger stated need.": "Yüksek, daha güçlü bir ihtiyaç demek.",
  "Lower means less effect on your goal.": "Düşük, hedefine daha az etki demek.",
  "Lower means fewer impulse signals.": "Düşük, daha az anlık istek sinyali demek.",
  "This is {n}% of your monthly income.": "Bu, aylık gelirinin %{n} kadarı.",
  "It could delay your {g} goal by about {n} days.":
    "{g} hedefini yaklaşık {n} gün geciktirebilir.",
  "It's {n}% of what's left for {g}.": "{g} için kalanın %{n} kadarı.",
  "A reliable delay estimate isn't available yet.": "Güvenilir bir gecikme tahmini henüz yok.",
  "Why?": "Neden?",
  Context: "Bağlam",
  "Saved: Wait.": "Kaydedildi: Bekle.",
  "Install app": "Uygulamayı yükle",
  "How to install": "Nasıl yüklenir",
  "Install SpendSense": "SpendSense'i yükle",
  "Add SpendSense to your device for quick access from your home screen.":
    "Ana ekranından hızlıca açmak için SpendSense'i cihazına ekle.",
  Device: "Cihaz",
  "Add to Home Screen": "Ana Ekrana Ekle",
  "Install the app": "Uygulamayı yükle",
  "Open SpendSense in Safari.": "SpendSense'i Safari'de aç.",
  "Tap the Share button.": "Paylaş düğmesine dokun.",
  "Select “Add to Home Screen”.": "“Ana Ekrana Ekle”yi seç.",
  "Tap “Add” to finish.": "Bitirmek için “Ekle”ye dokun.",
  "Open SpendSense in a supported browser.": "SpendSense'i desteklenen bir tarayıcıda aç.",
  "Select “Install app” when the browser offers the option.":
    "Tarayıcı sunduğunda “Uygulamayı yükle”yi seç.",
  "Confirm installation.": "Yüklemeyi onayla.",
  "Other iOS browsers may not offer this option.":
    "Diğer iOS tarayıcıları bu seçeneği sunmayabilir.",
  "The install dialog is shown by your browser or operating system.":
    "Yükleme penceresini tarayıcın veya işletim sistemin gösterir.",
  "Got it": "Anladım",
  "Context for your purchases. The decision stays yours.":
    "Alışverişlerin için bağlam. Karar sende kalır.",
  "See how it works": "Nasıl çalışır?",
  "Add a purchase": "Bir ürün ekle",
  "See your context": "Bağlamını gör",
  "You decide": "Sen karar ver",
  "Track money": "Parayı takip et",
  "Impulse check": "Anlık istek kontrolü",
  "Your data stays private": "Verilerin gizli kalır",
  "Ready to start?": "Başlamaya hazır mısın?",
  "Add income": "Gelir ekle",
  "Add expense": "Gider ekle",
  "You're getting closer to your goal.": "Hedefine yaklaşıyorsun.",
  "You tend to pause longer before bigger purchases.":
    "Büyük alışverişlerden önce daha uzun düşünüyor gibisin.",
  "Getting started": "Başlarken",
  "Add a goal": "Bir hedef ekle",
  "Add your first entry": "İlk kaydını ekle",
  "Try “Should I buy it?”": "“Alsam mı?”yı dene",
  "All set — enjoy exploring.": "Hazırsın — keyifli keşifler.",
  about: "yaklaşık",
  Estimate: "Tahmin",
  "{n} / 3 selected": "{n} / 3 seçildi",
  "Maximum reached. Remove one to choose another.":
    "Sınıra ulaşıldı. Başka seçmek için birini kaldır.",
  "Pick at least one reason to continue.": "Devam etmek için en az bir neden seç.",
  "Enter an amount and pick a category.": "Bir tutar gir ve kategori seç.",
  Clear: "Temizle",
  "How was this calculated?": "Bu nasıl hesaplandı?",
  "You decide.": "Sen karar ver.",
  Buy: "Al",
  "Wait for how long?": "Ne kadar bekleyelim?",
  "Add to waiting list": "Bekleme listesine ekle",
  "Saved: Buy.": "Kaydedildi: Al.",
  "Saved: Skip.": "Kaydedildi: Atla.",
  "Your analysis could not be saved. Please try again.":
    "Analizin kaydedilemedi. Lütfen tekrar dene.",
  "Discard this purchase?": "Bu alım silinsin mi?",
  "Your answers for this purchase will not be saved.":
    "Bu alım için verdiğin cevaplar kaydedilmeyecek.",
  Discard: "Sil",
  "The bigger the share of what's left this month, the lower this score. This purchase uses {n}% of it.":
    "Bu ay kalan paradan aldığı pay büyüdükçe bu puan düşer. Bu alım kalanın %{n}'ini kullanıyor.",
  "Nothing is left this month, so this score is 0.": "Bu ay para kalmadığı için bu puan 0.",
  "Saying you need it, that it makes something easier, or that you don't own something similar raises this score. Owning a usable one lowers it.":
    "İhtiyacın olduğunu, bir şeyi kolaylaştırdığını ya da benzerine sahip olmadığını söylemen bu puanı artırır. Kullanılabilir bir benzerine sahip olmak düşürür.",
  "The bigger the share of what's left for {g}, the higher this score.":
    "{g} için kalan tutardan aldığı pay büyüdükçe bu puan artar.",
  "No active goal, so this score is 0.": "Aktif hedef olmadığı için bu puan 0.",
  "Sale, catching your eye, treating yourself, friends, and feeling excited, stressed, bored or tired each raise this score. So do a 24-hour wait and matching answers from your spending style.":
    "İndirim, gözüne çarpması, kendini ödüllendirme, arkadaş etkisi ve heyecanlı, stresli, sıkılmış ya da yorgun hissetmek bu puanı artırır. 24 saatlik bekleme ve harcama tarzındaki eşleşen cevaplar da artırır.",
  "Compare with goal": "Karşılaştırılacak hedef",
  "Overall fit adds budget fit and need level, plus the room left after goal impact and impulse signals: {a} + {b} + {c} + {d} = {f}. Each factor is 0–25. A simple heuristic for reflection, not financial advice.":
    "Genel uyum; bütçe uyumu ve ihtiyaç düzeyini, hedef etkisi ve anlık alım işaretlerinden sonra kalan payla toplar: {a} + {b} + {c} + {d} = {f}. Her etken 0–25 arasıdır. Düşünmeye yardımcı basit bir hesap, finansal tavsiye değildir.",
  "Wait adds it to your waiting list for {w}. Use Edit to change this.":
    "Bekle, bunu {w} boyunca bekleme listene ekler. Değiştirmek için Düzenle'yi kullan.",
  Type: "Tür",
  "Pick today or an earlier date.": "Bugünü ya da daha önceki bir tarihi seç.",
  "Delete last digit": "Son rakamı sil",
  Date: "Tarih",
  "Example preview": "Örnek önizleme",
  "HCI prototype": "HCI prototipi",
  "Used only to estimate budget fit until you add this month's income.":
    "Sadece bu ayın gelirini ekleyene kadar bütçe uyumunu tahmin etmek için kullanılır.",
  "Used only to estimate how a purchase could delay your goal.":
    "Sadece bir alımın hedefini ne kadar geciktirebileceğini tahmin etmek için kullanılır.",
  "Not sure? Keep the selected range and change it later in Settings.":
    "Emin değil misin? Seçili aralığı bırakıp sonra Ayarlar'dan değiştirebilirsin.",
  "You bought {p} {n} days ago. How do you feel about it now?":
    "{p} ürününü {n} gün önce aldın. Şimdi bu konuda ne hissediyorsun?",
  Status: "Durum",
  "No expenses this month yet.": "Bu ay henüz harcama yok.",
  "Counts of feelings and reasons across {n} decisions and waiting items. Observations only — not a judgment.":
    "{n} karar ve bekleyen öğedeki duygu ve gerekçelerin sayımı. Sadece gözlem, yargı değil.",
  "How decisions felt later": "Kararlar sonradan nasıl hissettirdi",
  "Rate a few past decisions in History and patterns will appear here.":
    "Geçmiş'te birkaç kararını puanlarsan örüntüler burada görünecek.",
  "Decisions made while feeling {f} got your lowest later ratings ({n}/5). Just something to notice.":
    "{f} hissederken verdiğin kararlar sonradan en düşük puanları aldı ({n}/5). Sadece fark etmen için.",
  "{n} rated": "{n} puanlı",
  "{n} ready to revisit": "{n} öğe incelemeye hazır",
  Tour: "Tur",
  "Log out?": "Çıkış yapılsın mı?",
  "You can finish these questions the next time you log in.":
    "Bu soruları bir sonraki girişinde tamamlayabilirsin.",
  "More info": "Daha fazla bilgi",
  "Example fit {n}": "Örnek uyum {n}",
  "Give your goal a name.": "Hedefine bir ad ver.",
  "Enter a target above zero.": "Sıfırdan büyük bir hedef tutarı gir.",
  "Pick a date after today, or leave it empty.": "Bugünden sonraki bir tarih seç ya da boş bırak.",
  "Your goal": "Hedefin",
  "Starting from zero is fine too.": "Sıfırdan başlamak da gayet olur.",
  "No deadline": "Tarih yok",
  "You've already reached this amount.": "Bu tutara zaten ulaşmışsın.",
  "Setting aside about {m} a month gets you there.":
    "Ayda yaklaşık {m} ayırırsan hedefine ulaşırsın.",
  "No deadline is fine too. You can add one later.":
    "Tarih koymamak da olur. Sonra ekleyebilirsin.",
  "Save goal": "Hedefi kaydet",
  "Discard this goal?": "Bu hedef silinsin mi?",
  "What you entered for this goal will not be saved.": "Bu hedef için girdiklerin kaydedilmeyecek.",
  "What are you saving for?": "Ne için biriktiriyorsun?",
  "How much do you need?": "Ne kadar paraya ihtiyacın var?",
  "How much have you already set aside?": "Şimdiye kadar ne kadar ayırdın?",
  "When would you like to reach it?": "Hedefine ne zaman ulaşmak istersin?",
  Laptop: "Dizüstü bilgisayar",
  Vacation: "Tatil",
  "Emergency fund": "Acil durum fonu",
  "New phone": "Yeni telefon",
  "3 months": "3 ay",
  "6 months": "6 ay",
  "1 year": "1 yıl",
  "Saved: Buy. Added to your expenses.": "Kaydedildi: Al. Harcamalarına eklendi.",
  "It would use {n}% of what's left this month.": "Bu ay kalan paranın %{n}'ini kullanır.",
  "Nothing is left this month after your expenses.": "Harcamalarından sonra bu ay para kalmadı.",
  "Based on this month's entries.": "Bu ayki kayıtlarına dayalı.",
  "Add money to this goal whenever you're ready.": "Hazır olduğunda bu hedefe para ekleyebilirsin.",
  "You said you tend to buy soon after seeing something.":
    "Beğendiğin bir şeyi genelde hemen aldığını söylemiştin.",
  "You said discounts often tempt you.": "İndirimlerin seni sık sık cezbettiğini söylemiştin.",
  "You said you usually treat yourself after a hard day.":
    "Zor bir günün ardından genelde kendini ödüllendirdiğini söylemiştin.",
  "You said friends shape what you buy quite a bit.":
    "Arkadaşlarının aldıklarını epey etkilediğini söylemiştin.",
  "Added to your waiting list.": "Bekleme listene eklendi.",
  "Estimate based on your onboarding ranges.": "Başlangıçtaki aralıklarına dayalı tahmin.",
  "Add goal": "Hedef ekle",
  "Edit goal": "Hedefi düzenle",
  Active: "Aktif",
  Completed: "Tamamlandı",
  Archived: "Arşivlendi",
  Saved: "Biriken",
  Target: "Hedef",
  Remaining: "Kalan",
  "Target date (optional)": "Hedef tarih (isteğe bağlı)",
  "Goal name": "Hedef adı",
  "Add money": "Para ekle",
  Archive: "Arşivle",
  Restore: "Geri yükle",
  "Delete this goal?": "Bu hedef silinsin mi?",
  "This removes the goal and its progress. It can't be undone.":
    "Hedef ve ilerlemesi kaldırılır. Geri alınamaz.",
  "Goal saved.": "Hedef kaydedildi.",
  "Goal deleted.": "Hedef silindi.",
  "You reached {g}. Nicely done — take a breath.": "{g} hedefine ulaştın. Güzel — bir nefes al.",
  "Your goal is taking shape.": "Hedefin şekilleniyor.",
  "Give the goal a name and a target above zero.": "Hedefe bir ad ve sıfırdan büyük bir hedef ver.",
  "We can revisit this whenever you're ready.": "Hazır olduğunda tekrar bakabiliriz.",
  Added: "Eklendi",
  Review: "Gözden geçir",
  "Still want it?": "Hâlâ istiyor musun?",
  "{n} days left": "{n} gün kaldı",
  Remove: "Kaldır",
  Fit: "Uyum",
  "How do you feel about this decision now?": "Bu karar hakkında şimdi ne hissediyorsun?",
  Uneasy: "Huzursuz",
  Unsure: "Emin değilim",
  Okay: "İdare eder",
  Good: "İyi",
  "Very good": "Çok iyi",
  Bought: "Alındı",
  Waited: "Beklendi",
  Skipped: "Atlandı",
  "Reflection saved.": "Düşüncen kaydedildi.",
  "Spending by category": "Kategoriye göre harcama",
  "Income vs. expenses": "Gelir ve gider",
  "Decision patterns": "Karar örüntüleri",
  "A few more decisions and patterns will appear.": "Birkaç karar daha ve örüntüler görünecek.",
  "You've often decided while feeling {f}. Just something to notice.":
    "Sıklıkla {f} hissederken karar vermişsin. Sadece fark etmek için.",
  "Most common reason: {r}": "En sık neden: {r}",
  Language: "Dil",
  Profile: "Profil",
  "Monthly income": "Aylık gelir",
  "Monthly savings": "Aylık birikim",
  "Retake spending style questions": "Harcama tarzı sorularını tekrar yanıtla",
  "Currency display": "Para birimi gösterimi",
  "Display only — amounts are not converted.": "Yalnızca gösterim — tutarlar çevrilmez.",
  "Restart tour": "Turu yeniden başlat",
  "Reset data": "Verileri sıfırla",
  "Log out": "Çıkış yap",
  About: "Hakkında",
  "Reset all data?": "Tüm veriler sıfırlansın mı?",
  "Entries, goals and decisions return to the demo data.":
    "Kayıtlar, hedefler ve kararlar demo verilere döner.",
  "SpendSense is an HCI course prototype. Scores are simple heuristics, not financial advice.":
    "SpendSense bir HCI ders prototipidir. Puanlar basit sezgilerdir, finansal tavsiye değildir.",
};
// English display text for values stored as short keys.
const EN: Record<string, string> = {
  need: "I need it",
  wanted: "Wanted it for a while",
  sale: "It's on sale",
  easier: "Makes something easier",
  social: "Friends have it",
  reward: "Treating myself",
  attention: "It caught my eye",
  other: "Other",
};
export function useT() {
  const { lang } = useContext(LangCtx);
  return (s: string, v?: Record<string, string | number>) => {
    let r = lang === "tr" ? (TR[s] ?? s) : (EN[s] ?? s);
    if (v) for (const k in v) r = r.replace(`{${k}}`, String(v[k]));
    return r;
  };
}
let curMode: "symbol" | "code" = "symbol";
export const setCurrencyMode = (m: "symbol" | "code") => {
  curMode = m;
};
export const curLabel = () => (curMode === "symbol" ? "₺" : "TRY");
// Range labels are written with ₺; show them in the chosen display mode.
export const rangeLabel = (r: string) =>
  curMode === "symbol" || !r.includes("₺") ? r : `${r.replace("₺", "")} TRY`;
export const fmt = (n: number) => {
  const s = Math.round(Math.abs(n)).toLocaleString("tr-TR");
  return (n < 0 ? "−" : "") + (curMode === "symbol" ? "₺" + s : s + " TRY");
};

/* ---------- display ---------- */
export const Logo = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
    <ellipse cx="20" cy="33" rx="12" ry="4" fill="#ffc93c" stroke="#2a1a2c" strokeWidth="2" />
    <ellipse cx="20" cy="27" rx="12" ry="4" fill="#ffc93c" stroke="#2a1a2c" strokeWidth="2" />
    <path d="M20 23V11" stroke="#2a1a2c" strokeWidth="2" />
    <path d="M20 13c0-6 8-8 11-6-1 6-7 7-11 6Z" fill="#ff6b4a" stroke="#2a1a2c" strokeWidth="2" />
    <path d="M20 15c0-4-5-5-7-4 1 4 4 5 7 4Z" fill="#1f7a58" stroke="#2a1a2c" strokeWidth="1.5" />
  </svg>
);
export type Expr = "neutral" | "happy" | "thinking" | "calm" | "curious" | "sleepy" | "wave";
export function Blob({
  expr = "neutral",
  size = 64,
  className = "",
}: {
  expr?: Expr;
  size?: number;
  className?: string;
}) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 4200);
    return () => clearInterval(id);
  }, []);
  const closed = expr === "calm" || expr === "sleepy" || blink;
  const mouth = {
    neutral: "M40 63 Q50 70 60 63",
    happy: "M37 60 Q50 76 63 60",
    thinking: "M42 65 L58 63",
    calm: "M42 64 Q50 69 58 64",
    curious: "M46 65 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0",
    sleepy: "M44 66 Q50 68 56 66",
    wave: "M37 60 Q50 76 63 60",
  }[expr];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      className={`shrink-0 ${expr === "wave" ? "wave" : "breathe"} ${className}`}
    >
      <path
        d="M50 8C79 8 94 31 92 57S74 94 50 94 8 83 8 57 21 8 50 8Z"
        fill="#ffc93c"
        stroke="#2a1a2c"
        strokeWidth="2.5"
      />
      <ellipse cx="38" cy="22" rx="14" ry="5" fill="#fff" opacity=".55" />
      {closed ? (
        <path
          d="M30 47q6 4 12 0M58 47q6 4 12 0"
          stroke="#2a1a2c"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <>
          <ellipse cx="36" cy={expr === "thinking" ? 43 : 46} rx="4" ry="6" fill="#2a1a2c" />
          <ellipse cx="64" cy={expr === "thinking" ? 43 : 46} rx="4" ry="6" fill="#2a1a2c" />
        </>
      )}
      {expr === "curious" && (
        <path d="M58 34l12-3" stroke="#2a1a2c" strokeWidth="2.5" strokeLinecap="round" />
      )}
      <circle cx="24" cy="59" r="6" fill="#ff6b4a" opacity=".45" />
      <circle cx="76" cy="59" r="6" fill="#ff6b4a" opacity=".45" />
      <path d={mouth} stroke="#2a1a2c" strokeWidth="3" fill="none" strokeLinecap="round" />
      {expr === "wave" && (
        <path
          d="M90 40q8-10 4-20"
          stroke="#2a1a2c"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
export const Bubble = ({ children }: { children: ReactNode }) => (
  <p className="f-voice clay rounded-tile! px-4 py-3 text-lg leading-snug m-0">{children}</p>
);
export const Say = ({
  expr,
  size = 64,
  live,
  children,
}: {
  expr?: Expr;
  size?: number;
  live?: boolean;
  children: ReactNode;
}) => (
  <div className="flex items-center gap-3 rise">
    <Blob expr={expr} size={size} />
    <div role={live ? "status" : undefined}>
      <Bubble>{children}</Bubble>
    </div>
  </div>
);
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  const [v, setV] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(value);
      return;
    }
    const start = performance.now(),
      a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      setV(a + (value - a) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={`f-num ${className}`}>{fmt(v)}</span>;
}

/* ---------- inputs ---------- */
type BV = "coral" | "sun" | "cream" | "leaf" | "butter";
export function Button({
  variant = "cream",
  big,
  icon,
  className = "",
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BV; big?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...p}
      className={`btn clay-${variant} ${big ? "min-h-[52px] text-lg px-6" : ""} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}
export const Chip = ({
  on,
  onClick,
  icon,
  children,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}) => (
  <button
    aria-pressed={on}
    disabled={disabled}
    onClick={onClick}
    className={`btn f-ui min-h-11! px-4! ${on ? "clay-sun" : "clay-cream"}`}
  >
    {on ? <Check size={16} aria-hidden /> : icon}
    {children}
  </button>
);
export const Pill = ({
  children,
  tone = "butter",
}: {
  children: ReactNode;
  tone?: "butter" | "leaf" | "violet" | "sun";
}) => {
  const c = {
    butter: "bg-butter text-attn",
    leaf: "bg-leaftint text-leaf",
    violet: "bg-violettint text-violet",
    sun: "bg-sun text-ink",
  }[tone];
  return (
    <span className={`f-ui text-sm px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${c}`}>
      {children}
    </span>
  );
};
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 p-1 rounded-full bg-track"
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const index = options.findIndex(([v]) => v === value);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + options.length) %
                options.length;
        onChange(options[next][0]);
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
      }}
    >
      {options.map(([v, l]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          tabIndex={value === v ? 0 : -1}
          onClick={() => onChange(v)}
          className={`f-ui min-h-11 px-4 rounded-full transition ${value === v ? "clay-sun" : "hover:bg-peach"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
export const Tile = ({
  on,
  onClick,
  icon,
  label,
  sub,
}: {
  on: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
  sub?: string;
}) => (
  <button
    aria-pressed={on}
    onClick={onClick}
    className={`relative rounded-tile min-h-[88px] p-3 flex flex-col items-center justify-center gap-1.5 text-center transition f-ui ${on ? "clay-sun ring-2 ring-ink" : "clay-cream hover:bg-peach"}`}
  >
    {on && <Check size={16} className="absolute top-2 right-2" aria-hidden />}
    {icon}
    <span>{label}</span>
    {sub && <span className="text-xs text-soft">{sub}</span>}
  </button>
);

/* ---------- progress ---------- */
export function Ring({
  value,
  size = 96,
  label,
  color = "#1f7a58",
}: {
  value: number;
  size?: number;
  label?: string;
  color?: string;
}) {
  const r = 40,
    c = 2 * Math.PI * r,
    v = Math.max(0, Math.min(100, value));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label ?? `${Math.round(v)}%`}
      className="shrink-0"
    >
      <circle cx="50" cy="50" r={r} stroke="#fbe3cf" strokeWidth="12" fill="none" />
      <circle
        cx="50"
        cy="50"
        r={r}
        stroke={color}
        strokeWidth="12"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v / 100)}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dashoffset .8s var(--ease-clay)" }}
      />
      <text x="50" y="57" textAnchor="middle" className="f-num" fontSize="22" fill="#2a1a2c">
        {Math.round(value)}
      </text>
    </svg>
  );
}
export const Tube = ({
  value,
  label,
  color = "bg-sun",
  showPct = true,
}: {
  value: number;
  label: string;
  color?: string;
  showPct?: boolean;
}) => (
  <div>
    <div className="flex justify-between f-ui text-sm mb-1">
      <span>{label}</span>
      {showPct && <span className="f-num">{Math.round(value)}%</span>}
    </div>
    <div
      className="h-3.5 rounded-full bg-track overflow-hidden shadow-[inset_0_2px_3px_#2a1a2c1a]"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.min(100, Math.max(0, Math.round(value)))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${color}`}
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          transition: "width .7s var(--ease-clay)",
        }}
      />
    </div>
  </div>
);

/* ---------- help & layout ---------- */
export function Tip({ text }: { text: string }) {
  const [o, setO] = useState(false);
  const id = useId();
  const t = useT();
  return (
    <span className="relative inline-flex">
      <button
        aria-label={t("More info")}
        aria-expanded={o}
        aria-describedby={o ? id : undefined}
        onClick={() => setO(!o)}
        onBlur={() => setO(false)}
        className="w-11 h-11 -m-2 inline-flex items-center justify-center text-info"
      >
        <Info size={18} />
      </button>
      {o && (
        <span
          role="tooltip"
          id={id}
          className="absolute z-20 top-9 left-1/2 -translate-x-1/2 w-60 clay rounded-inner! p-3 text-sm"
        >
          {text}
        </span>
      )}
    </span>
  );
}
export function Expand({ title, children }: { title: string; children: ReactNode }) {
  const [o, setO] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        aria-expanded={o}
        aria-controls={id}
        onClick={() => setO(!o)}
        className="f-ui min-h-11 flex items-center gap-1 text-info"
      >
        {title}
        <ChevronDown size={18} className={`transition ${o ? "rotate-180" : ""}`} />
      </button>
      {o && (
        <div id={id} className="rise text-sm text-soft pt-1">
          {children}
        </div>
      )}
    </div>
  );
}
export const Rule = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex justify-between gap-4 py-2 border-t border-cardline text-sm">
    <span className="text-soft">{k}</span>
    <span className="text-right">{v}</span>
  </div>
);
export const PageHead = ({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-wrap items-end justify-between gap-3 rise">
    <div>
      <h1 className="text-3xl md:text-4xl font-bold m-0">{title}</h1>
      {sub && <p className="text-soft m-0 mt-1">{sub}</p>}
    </div>
    {action}
  </div>
);
export const Empty = ({
  expr = "sleepy",
  text,
  action,
}: {
  expr?: Expr;
  text: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-3 py-8 text-center">
    <Blob expr={expr} size={56} />
    <p className="f-voice text-lg m-0">{text}</p>
    {action}
  </div>
);
export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <section className={`clay p-5 md:p-6 rise ${className}`}>{children}</section>
);

/* ---------- feedback & overlays ---------- */
type Toast = { id: number; msg: string; undo?: () => void };
export const ToastCtx = createContext<(msg: string, undo?: () => void) => void>(() => {});
export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = (msg: string, undo?: () => void) => {
    const id = Date.now();
    setList((l) => [...l.slice(-2), { id, msg, undo }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 5500);
  };
  const t = useT();
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        className="fixed z-50 bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[min(92vw,420px)]"
        role="status"
        aria-live="polite"
      >
        {list.map((x) => (
          <div key={x.id} className="clay rise flex items-center gap-3 px-4 py-2 f-ui">
            <Check size={18} className="text-leaf" aria-hidden />
            <span className="flex-1">{x.msg}</span>
            {x.undo && (
              <button
                className="btn clay-butter min-h-11!"
                onClick={() => {
                  x.undo!();
                  setList((l) => l.filter((y) => y.id !== x.id));
                }}
              >
                <Undo2 size={16} />
                {t("Undo")}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
function useModal(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Make every sibling outside the modal inert, including mobile navigation.
    const siblings = new Map<HTMLElement, boolean>();
    let element = ref.current?.parentElement;
    while (element && element !== document.body) {
      for (const sibling of Array.from(element.parentElement?.children ?? [])) {
        if (sibling !== element && sibling instanceof HTMLElement) {
          siblings.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
      element = element.parentElement;
    }
    const resize = () =>
      ref.current?.style.setProperty(
        "--visual-viewport-height",
        `${window.visualViewport?.height ?? innerHeight}px`,
      );
    resize();
    window.visualViewport?.addEventListener("resize", resize);
    ref.current
      ?.querySelector<HTMLElement>(
        "input:not(:disabled),button:not([data-modal-close]):not(:disabled),select:not(:disabled),textarea:not(:disabled)",
      )
      ?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ref.current?.closest("fieldset:disabled")) close.current();
      if (e.key === "Tab" && ref.current) {
        const f = Array.from(
          ref.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const a = f[0],
          b = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    addEventListener("keydown", k);
    return () => {
      removeEventListener("keydown", k);
      document.body.style.overflow = previousOverflow;
      for (const [element, inert] of siblings) element.inert = inert;
      window.visualViewport?.removeEventListener("resize", resize);
      if (prev?.isConnected) prev.focus();
    };
  }, []);
  return ref;
}
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useModal(onClose);
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-40 bg-ink/40 flex items-end md:items-center justify-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-panel clay rise w-full md:w-[min(720px,94vw)] max-h-[94vh] overflow-auto rounded-b-none md:rounded-card! p-5 md:p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold m-0">{title}</h2>
          <button
            aria-label={t("Close")}
            data-modal-close
            title={t("Close")}
            onClick={onClose}
            className="btn clay-cream w-11 px-0!"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Dialog({
  title,
  body,
  confirm,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void | boolean | Promise<void | boolean>;
  onClose: () => void;
}) {
  const ref = useModal(onClose);
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="modal-panel clay rise max-w-sm w-full p-6"
      >
        <h2 className="text-xl font-bold m-0">{title}</h2>
        <p className="text-soft">{body}</p>
        <div className="flex gap-2 justify-end flex-wrap">
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <button
            className={`btn ${danger ? "bg-danger text-white!" : "clay-coral"}`}
            onClick={async () => {
              if ((await onConfirm()) !== false) onClose();
            }}
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
