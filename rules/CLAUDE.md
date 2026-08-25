## Konwencje zespołowe (dostarczane przez @lirdaw/ai-toolkit)

Ten blok jest zarządzany przez paczkę. Nie edytuj go ręcznie — przy najbliższej
aktualizacji zostanie podmieniony. Własne notatki dopisuj poza tym blokiem.

### Dane w kodzie

Kod nie zawiera danych: kluczy, haseł, adresów, danych osobowych ani nazw
klientów. Wartości środowiskowe idą przez zmienne środowiskowe, nie przez
literały w źródle.

### Obsługa błędów

Wyjątek albo obsługujesz, albo propagujesz. Pusty `catch` jest błędem, nawet
gdy nic się przez niego dotąd nie wysypało.

### Zakres zmiany

Jedna zmiana realizuje jeden temat. Przeformatowanie, poprawki „przy okazji"
i sprzątanie idą osobno — inaczej nie da się odróżnić istotnego fragmentu
od szumu.

### Review przed scaleniem

Żadna zmiana nie jest scalana bez przeglądu według obowiązujących kryteriów.
Przegląd kończy się jednoznacznym werdyktem, a werdykt odmowny wstrzymuje
scalenie do czasu naniesienia poprawek albo pisemnego uzasadnienia odstępstwa.

### Granice oceny

Ocenia się wyłącznie to, co widać w materiale. Brak informacji zgłasza się jako
brak informacji, nigdy jako usterkę.
