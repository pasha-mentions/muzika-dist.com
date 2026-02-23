import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Snowflake, LogOut, Mail, Phone, Send } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function OrganizationFrozen() {
  const { i18n } = useTranslation();
  
  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { 
        method: 'POST', 
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      queryClient.clear();
      
      if (response.ok) {
        const data = await response.json();
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else {
          window.location.replace('/');
        }
      } else {
        window.location.replace('/');
      }
    } catch (error) {
      console.error('Logout error:', error);
      queryClient.clear();
      window.location.replace('/');
    }
  };

  const getMessage = () => {
    const lang = i18n.language;
    if (lang === 'uk') {
      return {
        title: "Обліковий запис призупинено",
        description: "Доступ до вашого облікового запису тимчасово обмежено.",
        explanation: "Якщо у вас є питання щодо статусу вашого облікового запису, будь ласка, зв'яжіться зі службою підтримки:",
        logout: "Вийти",
        contactTitle: "Зв'язатися з підтримкою",
        email: "Електронна пошта",
        telegram: "Telegram",
        phone: "Телефон"
      };
    } else if (lang === 'pl') {
      return {
        title: "Konto zawieszone",
        description: "Dostęp do Twojego konta jest tymczasowo ograniczony.",
        explanation: "Jeśli masz pytania dotyczące statusu swojego konta, skontaktuj się z pomocą techniczną:",
        logout: "Wyloguj się",
        contactTitle: "Skontaktuj się z pomocą",
        email: "E-mail",
        telegram: "Telegram",
        phone: "Telefon"
      };
    }
    return {
      title: "Account Suspended",
      description: "Access to your account has been temporarily restricted.",
      explanation: "If you have questions about your account status, please contact support:",
      logout: "Log out",
      contactTitle: "Contact Support",
      email: "Email",
      telegram: "Telegram",
      phone: "Phone"
    };
  };

  const msg = getMessage();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Snowflake className="w-8 h-8 text-blue-500" />
          </div>
          <CardTitle className="text-2xl">{msg.title}</CardTitle>
          <CardDescription className="text-base mt-2">
            {msg.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground text-center">
            {msg.explanation}
          </p>
          
          <div className="space-y-3">
            <p className="text-sm font-medium text-center">{msg.contactTitle}</p>
            
            <div className="flex flex-col gap-2">
              <a 
                href="mailto:muzika.ua.info@gmail.com"
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors"
              >
                <Mail className="w-5 h-5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{msg.email}</span>
                  <span className="text-sm">muzika.ua.info@gmail.com</span>
                </div>
              </a>
              
              <a 
                href="https://t.me/muzika_info"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors"
              >
                <Send className="w-5 h-5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{msg.telegram}</span>
                  <span className="text-sm">@muzika_info</span>
                </div>
              </a>
              
              <a 
                href="tel:+380673105191"
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors"
              >
                <Phone className="w-5 h-5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{msg.phone}</span>
                  <span className="text-sm">067 310 51 91</span>
                </div>
              </a>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            className="w-full"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {msg.logout}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
