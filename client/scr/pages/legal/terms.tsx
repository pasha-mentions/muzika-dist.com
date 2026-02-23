import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import muzikaLogo from "@assets/logo_1765186159346.png";

export default function TermsAndConditions() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('legal.backToHome')}
          </Button>
          <img src={muzikaLogo} alt="MUZIKA" className="h-6 w-auto" />
        </div>

        <Card>
          <CardContent className="p-6 md:p-10">
            <h1 className="text-2xl md:text-3xl font-bold mb-6 text-white">{t('legal.terms.title')}</h1>
            
            <div className="prose prose-sm md:prose dark:prose-invert max-w-none text-white [&_h1]:text-white [&_h2]:text-white [&_p]:text-white [&_li]:text-white">
              <p className="text-white/70 mb-6">{t('legal.terms.intro')}</p>

              <h2>1. {t('legal.terms.section1.title')}</h2>
              <ul>
                <li>{t('legal.terms.section1.item1')}</li>
                <li>{t('legal.terms.section1.item2')}</li>
                <li>{t('legal.terms.section1.item3')}</li>
              </ul>

              <h2>2. {t('legal.terms.section2.title')}</h2>
              <ul>
                <li>{t('legal.terms.section2.item1')}</li>
                <li>{t('legal.terms.section2.item2')}</li>
                <li>{t('legal.terms.section2.item3')}</li>
              </ul>

              <h2>3. {t('legal.terms.section3.title')}</h2>
              <ul>
                <li>{t('legal.terms.section3.item1')}</li>
                <li>{t('legal.terms.section3.item2')}</li>
                <li>{t('legal.terms.section3.item3')}</li>
              </ul>

              <h2>4. {t('legal.terms.section4.title')}</h2>
              <ul>
                <li>{t('legal.terms.section4.item1')}</li>
                <li>{t('legal.terms.section4.item2')}</li>
              </ul>

              <h2>5. {t('legal.terms.section5.title')}</h2>
              <ul>
                <li>{t('legal.terms.section5.item1')}</li>
                <li>{t('legal.terms.section5.item2')}</li>
                <li>{t('legal.terms.section5.item3')}</li>
              </ul>

              <h2>6. {t('legal.terms.section6.title')}</h2>
              <ul>
                <li>{t('legal.terms.section6.item1')}</li>
                <li>{t('legal.terms.section6.item2')}</li>
                <li>{t('legal.terms.section6.item3')}</li>
              </ul>

              <h2>7. {t('legal.terms.section7.title')}</h2>
              <p>{t('legal.terms.section7.content')}</p>
              <ul>
                <li>📧 muzika.ua.info@gmail.com</li>
                <li>🌐 https://muzika.ua</li>
                <li>💽 https://muzika-dist.com</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
