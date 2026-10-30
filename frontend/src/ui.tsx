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
import { formatExactAmount } from "./lib/money";
import { nextSegmentIndex } from "./lib/segmented";
import { formatMoney, type Currency } from "./lib/currency";
import { amountUnit, formatWholeAmount } from "./lib/moneyTotals";

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
  "Getting your data ready...": "Verilerin hazırlanıyor...",
  "Switching language...": "Dil değiştiriliyor...",
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
  // Multi-currency (Phase 4: prepared, shown by later phases).
  "A newer version of the app is available. Please update the app to keep your data safe.":
    "Uygulamanın yeni bir sürümü mevcut. Verilerinizi korumak için lütfen uygulamayı güncelleyin.",
  "Saving USD or EUR amounts is not available yet. Your data was not changed.":
    "USD veya EUR tutarlarını kaydetmek henüz mümkün değil. Verilerin değiştirilmedi.",
  "Display currency": "Görüntüleme para birimi",
  "Amount format": "Tutar biçimi",
  "Which currency do you use?": "Hangi para birimini kullanıyorsun?",
  "You can change this later in Settings.": "Bunu daha sonra Ayarlar'dan değiştirebilirsin.",
  "Income ranges are in Turkish lira.": "Gelir aralıkları Türk lirası cinsindendir.",
  "USD and EUR become available when multi-currency support is turned on. Amounts stay in TRY until then.":
    "USD ve EUR, çoklu para birimi desteği açıldığında kullanılabilir olacak. O zamana kadar tutarlar TL olarak kalır.",
  "Totals are shown in this currency. Your records keep their original amounts.":
    "Toplamlar bu para biriminde gösterilir. Kayıtların orijinal tutarlarını korur.",
  "This month": "Bu ay",
  Left: "Kalan",
  "Totals in {c}": "{c} cinsinden toplamlar",
  "By currency": "Para birimine göre",
  "Approximate. Converted with TCMB rates from {date}.":
    "Yaklaşık değer. {date} tarihli TCMB kurlarıyla çevrildi.",
  "These rates may be out of date.": "Bu kurlar güncel olmayabilir.",
  "Exchange rates are unavailable right now, so amounts in different currencies are not added together.":
    "Döviz kurları şu anda alınamıyor, bu yüzden farklı para birimlerindeki tutarlar toplanmıyor.",
  "Checking exchange rates…": "Döviz kurları kontrol ediliyor…",
  "Try again": "Tekrar dene",
  "Totals could not be calculated.": "Toplamlar hesaplanamadı.",
  "A saved entry keeps its original currency.": "Kaydedilen bir işlem kendi para birimini korur.",
  "Goal currency": "Hedef para birimi",
  "A goal keeps the currency it was created in.": "Bir hedef, oluşturulduğu para birimini korur.",
  "About {saved} of {target} in {c}.": "{c} cinsinden yaklaşık {target} içinden {saved}.",
  "Exchange rates are unavailable, so this goal is shown in {c} only.":
    "Döviz kurları alınamadığı için bu hedef yalnızca {c} cinsinden gösteriliyor.",
  "Exchange rates are unavailable right now, so what's left this month can't be calculated. Amounts are shown by currency.":
    "Döviz kurları şu anda alınamıyor, bu yüzden bu ay kalan tutar hesaplanamıyor. Tutarlar para birimine göre gösteriliyor.",
  "This chart can't be calculated right now because exchange rates are unavailable. Amounts are shown by currency.":
    "Döviz kurları alınamadığı için bu grafik şu anda hesaplanamıyor. Tutarlar para birimine göre gösteriliyor.",
  "Exchange rates are unavailable right now, so this purchase can't be compared with your budget and goals.":
    "Döviz kurları şu anda alınamıyor, bu yüzden bu satın alma bütçen ve hedeflerinle karşılaştırılamıyor.",
  "This purchase can't be analyzed because an amount is not valid.":
    "Bir tutar geçerli olmadığı için bu satın alma analiz edilemiyor.",
  "I can't put this purchase in context right now.":
    "Bu satın almayı şu anda bağlamına yerleştiremiyorum.",
  "A saved purchase keeps its original currency.":
    "Kaydedilen bir satın alma kendi para birimini korur.",
  "Numbers only, without thousands separators. Use a comma or dot for cents, e.g. 1250 or 1250.50.":
    "Binlik ayırıcı olmadan yalnızca rakam gir. Sent için virgül ya da nokta kullan, örn. 1250 veya 1250,50.",
  "Transaction currency": "İşlem para birimi",
  Currency: "Para birimi",
  "Approximate amount": "Yaklaşık tutar",
  "Approximate, converted with TCMB rates.": "TCMB kurlarıyla yaklaşık olarak çevrildi.",
  "TCMB bulletin {date}": "TCMB {date} bülteni",
  "Exchange rates may be outdated (TCMB bulletin {date}).":
    "Döviz kurları güncel olmayabilir (TCMB {date} bülteni).",
  "You're offline. Showing the last saved exchange rates (TCMB bulletin {date}).":
    "Çevrimdışısın. Son kaydedilen döviz kurları gösteriliyor (TCMB {date} bülteni).",
  "Exchange rates are unavailable. Amounts in different currencies are shown separately.":
    "Döviz kurlarına şu an ulaşılamıyor. Farklı para birimlerindeki tutarlar ayrı gösteriliyor.",
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
  "Creating account...": "Hesap oluşturuluyor...",
  "At least {n} characters": "En az {n} karakter",
  "Requirement met": "Koşul sağlandı",
  "Requirement not met yet": "Koşul henüz sağlanmadı",
  "Already have an account? Log in": "Hesabın var mı? Giriş yap",
  "New here? Create your account": "Yeni misin? Hesabını oluştur",
  "Forgot password?": "Şifremi unuttum",
  "Check your email": "E-postanı kontrol et",
  "We sent a confirmation link to {e}. Open it to activate your account, then log in.":
    "{e} adresine bir onay bağlantısı gönderdik. Hesabını etkinleştirmek için bağlantıyı aç, sonra giriş yap.",
  "Can't find it? Check your spam or junk folder. It can take a few minutes to arrive.":
    "Bulamadın mı? Spam veya gereksiz klasörünü kontrol et. E-postanın gelmesi birkaç dakika sürebilir.",
  "Go to log in": "Girişe git",
  "Resend email": "E-postayı tekrar gönder",
  "Sending...": "Gönderiliyor...",
  "You can resend in {n} s.": "{n} sn sonra tekrar gönderebilirsin.",
  "Use a different email": "Farklı bir e-posta kullan",
  "If this address still needs confirmation, a new link is on its way.":
    "Bu adres hâlâ onay bekliyorsa yeni bir bağlantı yolda.",
  "Reset your password": "Şifreni sıfırla",
  "Enter your account email. We'll send you a link to set a new password.":
    "Hesabının e-posta adresini gir. Yeni şifre belirlemen için bir bağlantı göndereceğiz.",
  "Send reset link": "Sıfırlama bağlantısı gönder",
  "Send again": "Tekrar gönder",
  "If an account exists for this email, a reset link is on its way.":
    "Bu e-postaya ait bir hesap varsa sıfırlama bağlantısı yolda.",
  "We couldn't send the email right now. Try again in a few minutes.":
    "E-postayı şu an gönderemedik. Birkaç dakika sonra tekrar dene.",
  "Back to log in": "Girişe dön",
  "Set a new password": "Yeni şifre belirle",
  "Choose a new password for your account.": "Hesabın için yeni bir şifre seç.",
  "Save new password": "Yeni şifreyi kaydet",
  "Checking your link...": "Bağlantın kontrol ediliyor...",
  "Password updated": "Şifre güncellendi",
  "Your new password is saved and you're signed in.": "Yeni şifren kaydedildi ve giriş yaptın.",
  "Continue to SpendSense": "SpendSense'e devam et",
  "This reset link no longer works": "Bu sıfırlama bağlantısı artık geçerli değil",
  "It may have expired or already been used. Reset links work once and expire after a while. Request a new one to continue.":
    "Süresi dolmuş ya da daha önce kullanılmış olabilir. Sıfırlama bağlantıları yalnızca bir kez çalışır ve bir süre sonra geçersiz olur. Devam etmek için yeni bir bağlantı iste.",
  "Send a new link": "Yeni bağlantı gönder",
  "Your reset link has expired. Request a new one.":
    "Sıfırlama bağlantının süresi doldu. Yeni bir bağlantı iste.",
  "Choose a new password that's different from your current one.":
    "Mevcut şifrenden farklı yeni bir şifre seç.",
  "Your password could not be changed. Request a new reset link and try again.":
    "Şifren değiştirilemedi. Yeni bir sıfırlama bağlantısı isteyip tekrar dene.",
  "This email link is invalid or has expired. Log in, or request a new link.":
    "Bu e-posta bağlantısı geçersiz ya da süresi dolmuş. Giriş yap veya yeni bir bağlantı iste.",
  "You are offline. Reconnect and try again.": "Çevrimdışısın. Bağlan ve tekrar dene.",
  "You are offline. Reconnect before signing in.": "Çevrimdışısın. Giriş yapmadan önce bağlan.",
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
  Feeling: "Duygu",
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
  "Enter a product name.": "Bir ürün adı gir.",
  "Enter a price above zero.": "Sıfırdan büyük bir fiyat gir.",
  "{v} out of {max}": "{max} üzerinden {v}",
  "Numbers only, without thousands separators. Use a comma or dot for kuruş, e.g. 1250 or 1250.50.":
    "Binlik ayırıcı olmadan yalnızca rakam gir. Kuruş için virgül ya da nokta kullan, örn. 1250 veya 1250,50.",
  "You can change any answer above. Nothing is analyzed again until you press Analyze.":
    "Yukarıdaki cevaplardan istediğini değiştirebilirsin. Analiz et'e basana kadar yeniden analiz yapılmaz.",
  "Keep editing": "Düzenlemeye devam et",
  "Wait keeps it on your Waiting List for {w} without buying anything. Then it is marked ready to revisit there, so you can decide again. Use Edit to change the wait time.":
    "Bekle, hiçbir şey satın almadan ürünü {w} boyunca Bekleme Listende tutar. Süre dolunca orada tekrar bakmaya hazır olarak görünür ve yeniden karar verebilirsin. Bekleme süresini değiştirmek için Düzenle'yi kullan.",
  "Fits well": "Rahatça uyuyor",
  "Fits, but tight": "Uyuyor ama sınırda",
  "Stretches budget": "Bütçeyi zorluyor",
  "Strong need": "Güçlü ihtiyaç",
  "Some need": "Orta düzey ihtiyaç",
  "Little need": "Az ihtiyaç",
  "Large impact": "Büyük etki",
  "Moderate impact": "Orta düzey etki",
  "Small impact": "Küçük etki",
  "Many signals": "Çok sayıda sinyal",
  "Some signals": "Birkaç sinyal",
  "Few signals": "Az sinyal",
  "No active goal": "Aktif hedef yok",
  "Share of monthly income": "Aylık gelire oranı",
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
  "Tap the Share button (in the toolbar or the ••• menu).":
    "Paylaş düğmesine dokun (araç çubuğunda veya ••• menüsünde).",
  "Select “Add to Home Screen”.": "“Ana Ekrana Ekle”yi seç.",
  "Keep “Open as Web App” on if shown, then tap “Add”.":
    "“Web Uygulaması Olarak Aç” görünürse açık bırak, sonra “Ekle”ye dokun.",
  "Open SpendSense from its new home screen icon.":
    "SpendSense'i ana ekrandaki yeni simgesinden aç.",
  "Open SpendSense in Chrome, Edge or Samsung Internet.":
    "SpendSense'i Chrome, Edge veya Samsung Internet'te aç.",
  "Open the browser menu (⋮).": "Tarayıcı menüsünü (⋮) aç.",
  "Tap “Install app” or “Add to Home screen”.":
    "“Uygulamayı yükle” veya “Ana ekrana ekle”ye dokun.",
  "Confirm installation.": "Yüklemeyi onayla.",
  "Don’t see it? Scroll down in the Share menu. On iOS 16.4 or later, Chrome and Edge offer it in their Share menu too.":
    "Göremiyor musun? Paylaş menüsünde aşağı kaydır. iOS 16.4 ve sonrasında Chrome ve Edge de bu seçeneği Paylaş menüsünde sunar.",
  "On a computer, use the install icon in the address bar. The install dialog is shown by your browser or operating system.":
    "Bilgisayarda adres çubuğundaki yükleme simgesini kullan. Yükleme penceresini tarayıcın veya işletim sistemin gösterir.",
  "You seem to be in an app’s built-in browser, which can’t install apps. Open this page in Safari or Chrome first.":
    "Bir uygulamanın içindeki tarayıcıdasın gibi görünüyor; buradan uygulama yüklenemez. Önce bu sayfayı Safari'de veya Chrome'da aç.",
  "Use SpendSense like an app": "SpendSense'i uygulama gibi kullan",
  "Add it to your home screen for one-tap, full-screen access.":
    "Tek dokunuşla, tam ekran açmak için ana ekranına ekle.",
  "Got it": "Anladım",
  "Context for your purchases. The decision stays yours.":
    "Alışverişlerin için bağlam. Karar sende kalır.",
  "How it works": "Nasıl çalışır?",
  "SpendSense home": "SpendSense ana sayfa",
  "From “I want it” to a decision you feel good about":
    "“Bunu istiyorum”dan içine sinen bir karara",
  "SpendSense doesn't block purchases or tell you what to do. It gathers the context you'd want before paying and lays it out in plain words.":
    "SpendSense alışverişini engellemez, sana ne yapacağını söylemez. Ödemeden önce bilmek isteyeceğin bağlamı toplar ve sade bir dille önüne koyar.",
  "About a minute per check": "Her kontrol yaklaşık bir dakika",
  "Five short questions": "Beş kısa soru",
  "You always decide": "Karar her zaman senin",
  "The journey, step by step": "Adım adım yolculuk",
  "Set up your profile": "Profilini oluştur",
  "Pick your income and savings range and answer a few questions about your habits. No bank connection and no exact figures needed.":
    "Gelir ve birikim aralığını seç, alışkanlıklarınla ilgili birkaç soruyu yanıtla. Banka bağlantısı ya da kesin rakam gerekmez.",
  "Log what comes in and goes out": "Gelen ve gideni kaydet",
  "Quick add takes a few taps. These entries tell SpendSense how much is really left this month.":
    "Hızlı ekleme birkaç dokunuş sürer. Bu kayıtlar SpendSense'e bu ay gerçekte ne kadar kaldığını söyler.",
  "Ask “Should I buy it?”": "“Alsam mı?” diye sor",
  "Answer five short questions: what it is, why you want it, how you feel, whether you already own something similar and how long you could wait.":
    "Beş kısa soruyu yanıtla: ne olduğu, neden istediğin, nasıl hissettiğin, benzerinin olup olmadığı ve ne kadar bekleyebileceğin.",
  "See the context": "Bağlamı gör",
  "Make your call": "Kararını ver",
  "Buy it, wait a while or skip it. Waiting parks the purchase on your waiting list until it's time to look again.":
    "Al, biraz bekle ya da vazgeç. Beklemek, alışverişi tekrar bakma zamanı gelene kadar bekleme listene koyar.",
  "Look back later": "Sonra geriye bak",
  "A few days after a purchase, SpendSense asks how you feel about it. Insights show which decisions you were glad about.":
    "Bir alışverişten birkaç gün sonra SpendSense ona dair ne hissettiğini sorar. İçgörüler hangi kararlardan memnun kaldığını gösterir.",
  "Four scores and an overall fit show, at a glance, how the purchase fits your situation.":
    "Dört puan ve genel uyum, alışverişin durumuna nasıl uyduğunu bir bakışta gösterir.",
  "How comfortably the price fits what you have left this month.":
    "Fiyatın bu ay elinde kalana ne kadar rahat sığdığı.",
  "How strongly the purchase meets a real need for you.":
    "Alışverişin senin için gerçek bir ihtiyacı ne kadar karşıladığı.",
  "How much the purchase could slow down what you're saving for.":
    "Alışverişin biriktirdiğin hedefi ne kadar yavaşlatabileceği.",
  "Whether the moment itself may be pushing you to buy.":
    "O anın kendisinin seni satın almaya itip itmediği.",
  "What each score tells you about a purchase.":
    "Her puanın bir alışveriş hakkında sana söyledikleri.",
  "No. Scores are simple heuristics to help you reflect, not financial advice.":
    "Hayır. Puanlar düşünmene yardımcı olan basit göstergelerdir, finansal tavsiye değildir.",
  "What the scores mean": "Puanlar ne anlama geliyor?",
  "Try it with your own numbers": "Kendi rakamlarınla dene",
  "Try the demo": "Demoyu dene",
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
  "Compare with goal": "Karşılaştırılacak hedef",
  Type: "Tür",
  "Pick today or an earlier date.": "Bugünü ya da daha önceki bir tarihi seç.",
  "Delete last digit": "Son rakamı sil",
  Date: "Tarih",
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
  "You'll need to log in again to see your data. Your data stays in your account.":
    "Verilerini görmek için tekrar giriş yapman gerekecek. Verilerin hesabında kalır.",
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
  "Yes, still usable": "Evet, hâlâ kullanılabilir",
  "Yes, not usable": "Evet, kullanılamaz",
  "New purchase": "Yeni alım",
  "Purchase receipt": "Alım fişi",
  "That's {n}% of what's left this month.": "Bu ay kalan paranın %{n} kadarı.",
  Reasons: "Gerekçeler",
  "Similar item": "Benzer ürün",
  "Wait time": "Bekleme süresi",
  Groceries: "Market",
  Education: "Eğitim",
  Subscriptions: "Abonelikler",
  Clothing: "Giyim",
  "Personal care": "Kişisel bakım",
  Scholarship: "Burs",
  Freelance: "Freelance",
  Investment: "Yatırım",
  Refund: "İade",
  "The passwords don't match.": "Şifreler eşleşmiyor.",
  "Your password could not be changed. Log in again and retry.":
    "Şifren değiştirilemedi. Tekrar giriş yapıp yeniden dene.",
  "Password changed.": "Şifren değiştirildi.",
  "You are offline. Reconnect before changing your password.":
    "Çevrimdışısın. Şifreni değiştirmeden önce bağlantını kontrol et.",
  "Change password": "Şifreyi değiştir",
  "New password": "Yeni şifre",
  "Repeat new password": "Yeni şifreyi tekrar gir",
  Account: "Hesap",
  "Use at least 8 characters.": "En az 8 karakter kullan.",
  "Your data stays in your account.": "Verilerin hesabında kalır.",
  Preferences: "Tercihler",
  "Budget basics": "Bütçe bilgileri",
  "Used until you add this month's income.": "Bu ayın gelirini ekleyene kadar kullanılır.",
  "Used to estimate how purchases delay your goals.":
    "Alımların hedeflerini ne kadar geciktireceğini tahmin etmek için kullanılır.",
  "Retake the questions": "Soruları yeniden cevapla",
  "Your data": "Verilerin",
  "Export entries": "Kayıtları dışa aktar",
  "Income and expenses as a spreadsheet (CSV).": "Gelir ve giderlerin tablo dosyası olarak (CSV).",
  "Download CSV": "CSV indir",
  "Full backup": "Tam yedek",
  "Everything you saved, including goals and decisions (JSON).":
    "Hedefler ve kararlar dahil kaydettiğin her şey (JSON).",
  "Download JSON": "JSON indir",
  "Deletes entries, goals, analyses and decisions. Your account stays.":
    "Kayıtları, hedefleri, analizleri ve kararları siler. Hesabın kalır.",
  Help: "Yardım",
  "A short walkthrough of the main features.": "Ana özelliklerin kısa bir turu.",
  Start: "Başlat",
  Install: "Yükle",
  Privacy: "Gizlilik",
  "Your financial data is saved to your account and visible only to you.":
    "Finansal verilerin hesabına kaydedilir ve sadece sen görebilirsin.",
  Version: "Sürüm",
  Note: "Not",
  "Example assumes a monthly income of about {m}.": "Örnek, aylık yaklaşık {m} gelir varsayar.",
  "Free · No bank connection needed": "Ücretsiz · Banka bağlantısı gerekmez",
  "SpendSense shows how a purchase fits your budget, goals and mood before you buy. No lectures, no blocking. The decision stays yours.":
    "SpendSense, bir alımın bütçene, hedeflerine ve o anki ruh haline nasıl uyduğunu satın almadan önce gösterir. Nutuk yok, engel yok. Karar her zaman senin.",
  "Try it now": "Hemen dene",
  "Works on your phone": "Telefonunda çalışır",
  "Most regret buys start the same way": "Pişman olunan alımların çoğu aynı şekilde başlar",
  "Spending isn't only about money. These moments push us to buy before we've thought it through.":
    "Harcamak sadece parayla ilgili değil. Bu anlar, düşünmeye fırsat bulmadan almamıza yol açar.",
  "It's on sale": "İndirimde",
  "A countdown or a big red discount makes waiting feel like losing.":
    "Geri sayım ya da büyük kırmızı bir indirim, beklemeyi kaybetmek gibi hissettirir.",
  "A hard day": "Zor bir gün",
  "Stress, boredom or tiredness turn shopping into a quick mood fix.":
    "Stres, can sıkıntısı ya da yorgunluk alışverişi hızlı bir moral ilacına çevirir.",
  "Everyone has it": "Herkeste var",
  "What friends and feeds show us quietly becomes what we need.":
    "Arkadaşlarımızın ve akışımızın gösterdikleri sessizce ihtiyacımıza dönüşür.",
  "Move the price and pick reasons to see how the context changes.":
    "Fiyatı kaydır ve gerekçeleri seç, bağlamın nasıl değiştiğini gör.",
  "Everything in one calm place": "Her şey tek ve sakin bir yerde",
  "Log income and expenses in a few taps, with ready-made categories.":
    "Gelir ve giderlerini hazır kategorilerle birkaç dokunuşta kaydet.",
  "A five-question check that shows the context before you pay.":
    "Ödemeden önce bağlamı gösteren beş soruluk bir kontrol.",
  "Park a purchase for 24 hours to a week and revisit it calmly.":
    "Bir alımı 24 saatten bir haftaya kadar beklet, sonra sakin kafayla yeniden bak.",
  "See how each purchase could delay what you're saving for.":
    "Her alımın biriktirdiğin hedefi ne kadar geciktirebileceğini gör.",
  "Spot the moods and reasons behind your spending.":
    "Harcamalarının ardındaki duyguları ve gerekçeleri fark et.",
  Reflection: "Yansıtma",
  "Rate past decisions and learn which ones you're glad about.":
    "Geçmiş kararlarını puanla, hangilerinden memnun kaldığını öğren.",
  "Built on a few promises": "Birkaç söz üzerine kurulu",
  "No red warnings or guilt. Just context, in plain words.":
    "Kırmızı uyarı ya da suçluluk yok. Sadece sade bir dille bağlam.",
  "Scores never block a purchase. Every decision is yours.":
    "Puanlar hiçbir alımı engellemez. Her karar senin.",
  "Your entries are saved to your account and visible only to you.":
    "Kayıtların hesabına kaydedilir ve sadece sen görebilirsin.",
  "No bank connection": "Banka bağlantısı yok",
  "You add what you want to track. Nothing is pulled from your accounts.":
    "Takip etmek istediklerini sen eklersin. Hesaplarından hiçbir şey çekilmez.",
  "Frequently asked questions": "Sık sorulan sorular",
  "Is SpendSense free?": "SpendSense ücretsiz mi?",
  "Yes. It's a university HCI course project and there's nothing to pay.":
    "Evet. Bir üniversite HCI ders projesi, ödenecek bir şey yok.",
  "Do I need to connect my bank account?": "Banka hesabımı bağlamam gerekiyor mu?",
  "No. You add the income, expenses and purchases you want to think about yourself.":
    "Hayır. Üzerine düşünmek istediğin gelir, gider ve alımları kendin eklersin.",
  "Is this financial advice?": "Bu finansal tavsiye mi?",
  "Where is my data stored?": "Verilerim nerede saklanıyor?",
  "In your SpendSense account. Only you can see it, and you can export or reset it anytime in Settings.":
    "SpendSense hesabında. Sadece sen görebilirsin, istediğin zaman Ayarlar'dan dışa aktarabilir ya da sıfırlayabilirsin.",
  "Can I use it on my phone?": "Telefonumda kullanabilir miyim?",
  "Yes. Open it in your phone's browser and add it to your home screen to use it like an app.":
    "Evet. Telefonunun tarayıcısında aç ve ana ekrana ekle, bir uygulama gibi kullan.",
  "Create a free account and check your next purchase in a minute.":
    "Ücretsiz bir hesap oluştur ve bir sonraki alımını bir dakikada kontrol et.",
  Product: "Ürün",
  Features: "Özellikler",
  "Create an account": "Hesap oluştur",
  "Log in to your account": "Hesabına giriş yap",
  App: "Uygulama",
  "Scores are simple heuristics, not financial advice.":
    "Puanlar basit hesaplardır, finansal tavsiye değildir.",
  "Start making calmer purchase decisions in a minute.":
    "Bir dakikada daha sakin alım kararları vermeye başla.",
  "Welcome back. Pick up where you left off.": "Tekrar hoş geldin. Kaldığın yerden devam et.",
  "Google sign-in is coming soon. Use your email for now.":
    "Google ile giriş yakında geliyor. Şimdilik e-postanla devam edebilirsin.",
  "Continue with Google": "Google ile devam et",
  "or with email": "veya e-posta ile",
  "Remember me": "Beni hatırla",
  "By creating an account, you agree to the Terms of Use and Privacy Policy.":
    "Hesap oluşturarak Kullanım Koşulları'nı ve Gizlilik Politikası'nı kabul etmiş olursun.",
  "First name": "Ad",
  "Last name": "Soyad",
  Name: "Ad soyad",
  "Enter your first and last name.": "Adını ve soyadını gir.",
  or: "veya",
  "Hi {n}! Let's look at your month together.": "Merhaba {n}! Bu ayına birlikte bakalım.",
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
/** An amount in its own currency, in the same style as fmt() (identical for TRY). */
export const fmtIn = (n: number, currency: Currency, approximate = false) =>
  formatWholeAmount(n, currency, curMode, approximate);
/** Unit for an amount field in `currency`: "₺" / "TRY", "$" / "USD". */
export const curLabelIn = (currency: Currency) => amountUnit(currency, curMode);
/** Decide only: keeps kuruş and uses the UI language's separators (fmt() is unchanged). */
export function useExactAmount() {
  const { lang } = useContext(LangCtx);
  return (n: number) => formatExactAmount(n, lang, curMode);
}
/** Decide: the exact amount in its own currency; TRY is formatted exactly as by useExactAmount. */
export function useExactAmountIn() {
  const { lang } = useContext(LangCtx);
  return (n: number, currency: Currency) =>
    currency === "TRY"
      ? formatExactAmount(n, lang, curMode)
      : formatMoney(n, currency, lang, { display: curMode });
}

/* ---------- display ---------- */
// Full-screen wait state: the logo coins stack up while a bar slides underneath.
export function Loading({ text }: { text: string }) {
  const t = useT();
  return (
    <div role="status" className="min-h-dvh grid place-items-center px-5">
      <div className="grid justify-items-center gap-5 text-center rise">
        <span className="load-bob clay rounded-full! w-24 h-24 grid place-items-center">
          <Logo size={56} />
        </span>
        <div className="grid gap-1">
          <b className="text-2xl">SpendSense</b>
          <p className="f-ui text-soft m-0">{t(text)}</p>
        </div>
        <span aria-hidden className="w-48 h-2 rounded-full bg-track overflow-hidden">
          <span className="load-bar block h-full w-2/5 rounded-full bg-leaf" />
        </span>
      </div>
    </div>
  );
}
// The official logo (public/spendsense-logo.png) cropped to its rounded tile by
// scripts/generate-icons.py. Decorative by default, because it sits next to the
// "SpendSense" name; pass alt="SpendSense" where the image is the only brand label.
export const Logo = ({ size = 36, alt = "" }: { size?: number; alt?: string }) => (
  <img
    src="/icons/spendsense-mark.png"
    width={size}
    height={size}
    alt={alt}
    draggable={false}
    className="shrink-0 select-none"
  />
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
export function CountUp({
  value,
  className = "",
  currency = "TRY",
  approximate = false,
}: {
  value: number;
  className?: string;
  /** Currency of `value`; TRY (the default) renders exactly as before. */
  currency?: Currency;
  /** Prefix "≈ " for a converted value. */
  approximate?: boolean;
}) {
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
  return (
    <span className={`f-num ${className}`}>
      {currency === "TRY" && !approximate ? fmt(v) : fmtIn(v, currency, approximate)}
    </span>
  );
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
  full,
  disabled = [],
  describedBy,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
  full?: boolean;
  /** Options shown but not selectable (aria-disabled); arrow keys skip them. */
  disabled?: readonly T[];
  describedBy?: string;
}) {
  const enabled = options.map(([v]) => !disabled.includes(v));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className={`${full ? "flex w-full" : "inline-flex flex-wrap"} gap-1 p-1 rounded-3xl bg-track`}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const index = options.findIndex(([v]) => v === value);
        const next = nextSegmentIndex(index, event.key, enabled);
        if (next < 0 || next === index) return;
        onChange(options[next][0]);
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
      }}
    >
      {options.map(([v, l], i) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          aria-disabled={!enabled[i] || undefined}
          tabIndex={value === v ? 0 : -1}
          onClick={() => enabled[i] && onChange(v)}
          className={`f-ui min-h-11 px-3 sm:px-4 leading-tight rounded-full transition ${full ? "flex-1" : ""} ${value === v ? "clay-sun" : enabled[i] ? "hover:bg-peach" : "text-soft cursor-not-allowed"}`}
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
  dense,
}: {
  on: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
  sub?: string;
  /** Category grids: 14px labels on phones so 3 columns fit without splitting words. */
  dense?: boolean;
}) => (
  <button
    aria-pressed={on}
    onClick={onClick}
    className={`relative rounded-tile min-h-[88px] px-2 py-3 flex flex-col items-center justify-center gap-1.5 text-center transition f-ui ${dense ? "text-sm sm:text-base" : ""} ${on ? "clay-sun ring-2 ring-ink" : "clay-cream hover:bg-peach"}`}
  >
    {on && <Check size={16} className="absolute top-2 right-2" aria-hidden />}
    {icon}
    {/* Wrap only between words; the grid guarantees room for the longest word. */}
    <span className="leading-tight [overflow-wrap:normal]">{label}</span>
    {sub && <span className="text-xs text-soft">{sub}</span>}
  </button>
);

/* ---------- progress ---------- */
export function Ring({
  value,
  size = 96,
  label,
  color = "#1f7a58",
  suffix = "",
}: {
  value: number;
  size?: number;
  label?: string;
  color?: string;
  suffix?: string;
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
      <text
        x="50"
        y="57"
        textAnchor="middle"
        className="f-num"
        fontSize={suffix ? 20 : 22}
        fill="#2a1a2c"
      >
        {Math.round(value)}
        {suffix}
      </text>
    </svg>
  );
}
export const Tube = ({
  value,
  label,
  color = "bg-sun",
  showPct = true,
  decorative = false,
}: {
  value: number;
  label: string;
  color?: string;
  showPct?: boolean;
  /** Hide the bar from assistive tech when nearby text already states the value. */
  decorative?: boolean;
}) => (
  <div>
    <div className="flex justify-between gap-2 f-ui text-sm mb-1">
      <span>{label}</span>
      {showPct && <span className="f-num shrink-0 whitespace-nowrap">{Math.round(value)}%</span>}
    </div>
    <div
      className="h-3.5 rounded-full bg-track overflow-hidden shadow-[inset_0_2px_3px_#2a1a2c1a]"
      {...(decorative
        ? { "aria-hidden": true }
        : {
            role: "progressbar",
            "aria-label": label,
            "aria-valuenow": Math.min(100, Math.max(0, Math.round(value))),
            "aria-valuemin": 0,
            "aria-valuemax": 100,
          })}
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
// The label column never gets narrower than its longest word, so a long value
// can no longer squeeze it into "Goal impac-t".
export const Rule = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="grid grid-cols-[minmax(min-content,2fr)_minmax(0,3fr)] gap-4 py-2 border-t border-cardline text-sm">
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
        "input:not(:disabled),button:not([data-modal-close]):not(:disabled):not([tabindex='-1']),select:not(:disabled),textarea:not(:disabled)",
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
  cancel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirm: string;
  /** Label of the button that closes the dialog without acting (default "Cancel"). */
  cancel?: string;
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
          <Button onClick={onClose}>{cancel ?? t("Cancel")}</Button>
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
