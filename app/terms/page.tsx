import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "תנאי שימוש",
  description: "תנאי השימוש של Attendance App.",
};

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <header className="legal-header">
          <img src="/icon-192.png" alt="Attendance App" width={72} height={72} />
          <div>
            <p className="eyebrow">Attendance App</p>
            <h1>תנאי שימוש</h1>
            <p className="legal-updated">עודכן לאחרונה: 28 באוגוסט 2026</p>
          </div>
        </header>

        <section>
          <h2>מטרת השירות</h2>
          <p>
            Attendance App מיועדת לניהול אישי של נוכחות, משמרות, הפסקות ושעות עבודה, כולל סנכרון עם Google Drive ו-Google Sheets.
          </p>
        </section>

        <section>
          <h2>אחריות המשתמש</h2>
          <p>
            המשתמש אחראי לבדוק את נכונות שעות העבודה, כללי ההפסקה, הרשומות והחישובים, ולוודא שהם תואמים למדיניות מקום העבודה שלו.
            האפליקציה אינה מהווה מערכת שכר רשמית, ייעוץ משפטי או אישור של מעסיק.
          </p>
        </section>

        <section>
          <h2>Google Drive ו-Google Sheets</h2>
          <p>
            תכונות הסנכרון תלויות בזמינות Google APIs ובהרשאות שהמשתמש מעניק. המשתמש רשאי לבטל את ההרשאה בכל עת. מחיקה, שינוי שם או העברה
            של קבצים ב-Google Drive עשויים להשתקף באפליקציה בסנכרון הבא.
          </p>
        </section>

        <section>
          <h2>זמינות ושינויים</h2>
          <p>
            השירות מסופק כפי שהוא (as is). ייתכנו תקלות, מגבלות API, שינויים בשירותי צד שלישי או תקופות חוסר זמינות. ניתן לעדכן, לשנות או להפסיק תכונות בעתיד.
          </p>
        </section>

        <section>
          <h2>שימוש תקין</h2>
          <p>
            אין להשתמש באפליקציה באופן שמפר חוק, פוגע בשירותי Google/Vercel, מנסה לעקוף מגבלות אבטחה או עושה שימוש בלתי מורשה בחשבונות או נתונים של אחרים.
          </p>
        </section>

        <section>
          <h2>הגבלת אחריות</h2>
          <p>
            במידה המרבית המותרת בדין, מפעיל האפליקציה אינו אחראי לנזק הנובע מהסתמכות על רשומות, חישובי שעות, אובדן נתונים, זמינות שירותי צד שלישי או שימוש שגוי באפליקציה.
          </p>
        </section>

        <section>
          <h2>פרטיות</h2>
          <p>השימוש במידע מתואר ב<Link href="/privacy">מדיניות הפרטיות</Link>.</p>
        </section>

        <section>
          <h2>יצירת קשר</h2>
          <p>לשאלות לגבי תנאי השימוש ניתן לפנות אל: <a href="mailto:eladshimonn@gmail.com">eladshimonn@gmail.com</a>.</p>
        </section>

        <nav className="legal-links" aria-label="קישורים משפטיים">
          <Link href="/">חזרה לאפליקציה</Link>
          <Link href="/privacy">מדיניות פרטיות</Link>
        </nav>
      </article>
    </main>
  );
}
