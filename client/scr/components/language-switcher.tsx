import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

const languages = [
  {
    code: 'en',
    name: 'English',
    flag: '🇬🇧'
  },
  {
    code: 'uk',
    name: 'Українська',
    flag: '🇺🇦'
  },
  {
    code: 'pl',
    name: 'Polski',
    flag: '🇵🇱'
  }
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [currentLang, setCurrentLang] = useState(i18n.language || 'en');

  const updateLanguageMutation = useMutation({
    mutationFn: async (langCode: string) => {
      await apiRequest("PUT", "/api/user/profile", { preferredLanguage: langCode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setCurrentLang(langCode);
    localStorage.setItem('language', langCode);
    
    if (isAuthenticated) {
      updateLanguageMutation.mutate(langCode);
    }
  };

  const currentLanguage = languages.find(lang => lang.code === currentLang) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="h-9 w-9 rounded-full"
          data-testid="language-switcher"
        >
          <span className="text-2xl">{currentLanguage.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className="cursor-pointer flex items-center gap-3 px-3 py-2"
            data-testid={`language-option-${language.code}`}
          >
            <span className="text-2xl">{language.flag}</span>
            <span className={`text-sm ${currentLang === language.code ? 'font-semibold' : ''}`}>
              {language.name}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
