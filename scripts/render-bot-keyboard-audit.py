"""Draw a schematic from actual Bot API payloads, not a Telegram screenshot."""
import json, re, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
folder=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/audit-4.2.1')
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def font(size):return ImageFont.truetype(font_path,size)
def text_label(text):return re.sub(r'[^\w\s/·—→←+½.,:?!-]', '',text).strip()
for phase,title in [('before','ДО · 4.2.0'),('after','ПОСЛЕ · 4.2.1')]:
    data=json.loads((folder/(phase+'.json')).read_text())
    rows=data['inlineKeyboard'];reply=data['replyKeyboard']['keyboard']
    height=204+44*(len(rows)+len(reply))+110
    im=Image.new('RGB',(390,height),'#10151e');d=ImageDraw.Draw(im)
    d.text((22,18),title,font=font(23),fill='#b7ee83')
    d.text((22,56),'Схема разметки Bot API',font=font(14),fill='#a1adbd')
    y=94
    def grid(items):
        global y
        for row in items:
            width=(346-6*(len(row)-1))/len(row)
            for i,b in enumerate(row):
                x=22+i*(width+6)
                d.rounded_rectangle((x,y,x+width,y+36),radius=8,fill='#253245',outline='#3c4e68')
                label=text_label(b['text']);size=14
                while d.textbbox((0,0),label,font=font(size))[2]>width-12 and size>10:size-=1
                d.text((x+width/2,y+18),label,font=font(size),anchor='mm',fill='#edf3ff')
            y+=44
    d.text((22,y),'Меню «Ещё» · '+str(len(rows))+' рядов',font=font(15),fill='#d1dbea');y+=30;grid(rows)
    y+=20;d.text((22,y),'Нижняя клавиатура · '+str(len(reply))+' ряда',font=font(15),fill='#d1dbea');y+=30;grid(reply)
    y+=14
    if phase=='after':
        d.rounded_rectangle((22,y,368,y+49),radius=8,fill='#263d30')
        d.text((34,y+9),'Возле поля ввода: Миниаппа',font=font(14),fill='#b7ee83')
        d.text((34,y+28),'Открытие напрямую через web_app',font=font(12),fill='#cfdfd0')
        y+=58
    else:
        d.text((22,y),'Код не настраивал кнопку у поля ввода',font=font(12),fill='#a1adbd');y+=27
    d.text((22,y+10),'Иконки опущены. Это схема, не скриншот Telegram.',font=font(11),fill='#92a0b4')
    im.crop((0,0,390,y+40)).save(folder/('bot-'+phase+'.png'))
