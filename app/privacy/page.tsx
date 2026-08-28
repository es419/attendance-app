import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "מדיניות פרטיות",
  description: "מדיניות הפרטיות של Attendance App והאופן שבו האפליקציה משתמשת ב-Google Drive וב-Google Sheets.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <header className="legal-header">
          <img src="/icon-192.png" alt="Attendance App" width={72} height={72} />
          <div>
            <p className="eyebrow">Attendance App</p>
            <h1>מדיניות פרטיות</h1>
            <p className="legal-updated">עודכן לאחרונה: 28 באוגוסט 2026</p>
          </div>
        </header>

        <section>
          <h2>מהי האפליקציה</h2>
          <p>
            Attendance App היא אפליקציית נוכחות אישית לניהול כניסה ויציאה, משמרות, הפסקות ורשומות עבודה,
            עם סנכרון ל-Google Drive ול-Google Sheets של המשתמש.
          </p>
        </section>

        <section>
          <h2>איזה מידע עשוי להיגש</h2>
          <p>בהסכמת המשתמש האפליקציה עשויה לקבל גישה לפרטי חשבון Google בסיסיים ולנתוני Google Drive ו-Google Sheets הדרושים להפעלת התכונות שביקש המשתמש.</p>
          <ul>
            <li>שם וכתובת אימייל בסיסיים לצורך זיהוי החשבון המחובר.</li>
            <li>קבצים, תיקיות וגיליונות ב-Google Drive/Sheets לצורך יצירה, קריאה, עדכון, העברה ומחיקה בהתאם לפעולות המשתמש.</li>
            <li>רשומות נוכחות, שעות, הפסקות והגדרות שהמשתמש מזין או יוצר באפליקציה.</li>
          </ul>
        </section>

        <section>
          <h2>איך המידע משמש</h2>
          <p>המידע משמש רק לצורך הפעלת האפליקציה: סנכרון רשומות נוכחות, ניהול קבצים ותיקיות, שחזור מצב העבודה, הצגת נתונים וחישובי שעות והפסקות.</p>
          <p>האפליקציה אינה מוכרת מידע אישי ואינה משתמשת בנתוני Google לצורכי פרסום.</p>
        </section>

        <section>
          <h2>שמירה מקומית וסנכרון</h2>
          <p>
            נתוני המקור נשמרים בעיקר ב-Google Drive וב-Google Sheets של המשתמש. לצורך עבודה מהירה ו-Offline,
            האפליקציה עשויה לשמור במכשיר מטמון מקומי ותור פעולות שטרם סונכרנו. נתוני אימות נשמרים בצורה מאובטחת
            באמצעות cookie מוצפן מסוג HttpOnly ואינם נחשפים לקוד ה-UI.
          </p>
        </section>

        <section>
          <h2>שיתוף מידע</h2>
          <p>
            האפליקציה אינה משתפת או מוכרת את נתוני המשתמש לצדדים שלישיים לצורכי שיווק. שירותי התשתית הדרושים להפעלת
            האפליקציה, כגון Google APIs ו-Vercel, עשויים לעבד בקשות טכניות כחלק מהפעלת השירות.
          </p>
        </section>

        <section>
          <h2>Google API Services User Data Policy</h2>
          <p>
            השימוש וההעברה של מידע שהתקבל מ-Google APIs לכל אפליקציה אחרת ייעשו בהתאם ל-Google API Services User Data Policy,
            לרבות דרישות Limited Use.
          </p>
        </section>

        <section>
          <h2>מחיקה וביטול גישה</h2>
          <p>
            ניתן להתנתק מ-Google Drive מתוך האפליקציה, לבטל את הרשאת האפליקציה דרך הגדרות חשבון Google, למחוק קבצים ב-Drive,
            ולמחוק מטמון מקומי באמצעות מחיקת נתוני האתר/האפליקציה בדפדפן. התנתקות אינה מוחקת אוטומטית קבצים שהמשתמש יצר ב-Drive.
          </p>
        </section>

        <section>
          <h2>אבטחה</h2>
          <p>
            נעשה שימוש ב-HTTPS ובהרשאות OAuth של Google. עם זאת, אין מערכת תוכנה שמבטיחה אבטחה מוחלטת, ולכן מומלץ לשמור על חשבון Google והמכשיר מוגנים.
          </p>
        </section>

        <section>
          <h2>יצירת קשר</h2>
          <p>לשאלות בנושא פרטיות או שימוש בנתונים ניתן לפנות אל: <a href="mailto:eladshimonn@gmail.com">eladshimonn@gmail.com</a>.</p>
        </section>

        <nav className="legal-links" aria-label="קישורים משפטיים">
          <Link href="/">חזרה לאפליקציה</Link>
          <Link href="/terms">תנאי שימוש</Link>
        </nav>
      </article>
    </main>
  );
}
