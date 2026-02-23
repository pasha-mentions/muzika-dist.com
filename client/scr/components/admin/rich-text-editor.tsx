import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { useRef, useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  ImagePlus,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Code,
  Minus,
  Loader2,
} from "lucide-react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  courseId?: string;
  placeholder?: string;
}

export default function RichTextEditor({ content, onChange, courseId, placeholder }: RichTextEditorProps) {
  const { toast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: "rounded-lg max-w-full",
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder: placeholder || "Почніть писати контент...",
      }),
    ],
    content: content || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none min-h-[300px] p-4 focus:outline-none prose-headings:text-foreground prose-p:text-foreground/90 prose-a:text-primary prose-strong:text-foreground prose-img:rounded-lg prose-img:mx-auto",
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith("image/")) {
            event.preventDefault();
            handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files[0]) {
          const file = event.clipboardData.files[0];
          if (file.type.startsWith("image/")) {
            event.preventDefault();
            handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || "", false);
    }
  }, [content]);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!courseId) {
      toast({ title: "Спочатку збережіть курс, щоб завантажувати зображення", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Дозволено тільки зображення", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Максимальний розмір зображення: 10 МБ", variant: "destructive" });
      return;
    }

    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const response = await fetch(`/api/admin/academy/courses/${courseId}/content-image`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      editor?.chain().focus().setImage({ src: data.url }).run();
      toast({ title: "Зображення завантажено" });
    } catch {
      toast({ title: "Не вдалося завантажити зображення", variant: "destructive" });
    } finally {
      setUploadingImage(false);
    }
  }, [courseId, editor, toast]);

  const handleSetLink = useCallback(() => {
    if (!linkUrl) {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
      editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkUrl("");
    setLinkPopoverOpen(false);
  }, [editor, linkUrl]);

  if (!editor) return null;

  const ToolbarButton = ({
    onClick,
    isActive,
    disabled,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`h-8 w-8 p-0 ${isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </Button>
  );

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-muted/30">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Жирний"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Курсив"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="Підкреслення"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          title="Закреслення"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title="Заголовок 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="Заголовок 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="Заголовок 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Маркований список"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="Нумерований список"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="Цитата"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="Блок коду"
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Горизонтальна лінія"
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          isActive={editor.isActive({ textAlign: "left" })}
          title="Вирівняти ліворуч"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={editor.isActive({ textAlign: "center" })}
          title="Вирівняти по центру"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={editor.isActive({ textAlign: "right" })}
          title="Вирівняти праворуч"
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${editor.isActive("link") ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Посилання"
              onClick={() => {
                const previousUrl = editor.getAttributes("link").href;
                setLinkUrl(previousUrl || "");
              }}
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="start">
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSetLink();
                  }
                }}
                className="text-sm"
              />
              <Button size="sm" onClick={handleSetLink}>
                OK
              </Button>
            </div>
            {editor.isActive("link") && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-red-500 hover:text-red-700 w-full"
                onClick={() => {
                  editor.chain().focus().unsetLink().run();
                  setLinkPopoverOpen(false);
                }}
              >
                Видалити посилання
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <ToolbarButton
          onClick={() => imageInputRef.current?.click()}
          disabled={uploadingImage || !courseId}
          title={courseId ? "Вставити зображення" : "Збережіть курс, щоб завантажувати зображення"}
        >
          {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Скасувати"
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Повторити"
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />

      {editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
          <div className="flex items-center gap-0.5 bg-background border rounded-lg shadow-lg p-1">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive("bold")}
              title="Жирний"
            >
              <Bold className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive("italic")}
              title="Курсив"
            >
              <Italic className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              isActive={editor.isActive("underline")}
              title="Підкреслення"
            >
              <UnderlineIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
          </div>
        </BubbleMenu>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
