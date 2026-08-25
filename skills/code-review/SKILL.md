---
name: code-review
description: Przeglad zmiany w kodzie wedlug stalej listy kryteriow, zakonczony jednym z trzech werdyktow. Uzyj, gdy trzeba ocenic diff, pull request albo swiezo napisany fragment przed scaleniem.
---

# Code review

Oceniasz **zmianę**, nie cały projekt. Materiałem jest diff albo wskazany fragment kodu.

## Zasada nadrzędna

**Nie orzekaj o tym, czego nie ma w materiale.** Jeśli diff nie pokazuje definicji funkcji, nie oceniaj tej definicji. Brak informacji zgłaszasz jako brak informacji, nie jako usterkę.

## Kryteria

Przejdź po kolei. Każde kryterium ocеniasz osobno.

1. **Poprawność** — czy zmiana robi to, co deklaruje? Szukaj przypadków brzegowych: puste wejście, wartość zerowa, `null`.
2. **Połknięty błąd** — czy któryś wyjątek jest przechwycony i zignorowany? Pusty `catch` to usterka, nawet gdy „nic złego się nie dzieje".
3. **Czytelność** — czy nazwy mówią, co przechowują? Czy da się przeczytać tę funkcję raz i zrozumieć?
4. **Dyscyplina zakresu** — czy w zmianie jest coś, co nie należy do jej tematu? Przypadkowe przeformatowanie, poprawka „przy okazji", zakomentowany kod.
5. **Ryzyko danych** — czy w kodzie są dane, których tam być nie powinno? Klucze, hasła, adresy, dane osobowe, nazwy klientów.

Kryterium, którego materiał nie pozwala ocenić, oznacz jako **nie dotyczy** — nie zgaduj.

## Werdykt

Kończysz dokładnie jednym:

- **APPROVED** — brak usterek albo wyłącznie drobne uwagi redakcyjne.
- **NEEDS ATTENTION** — usterki do poprawienia, ale żadna nie jest groźna.
- **REJECTED** — co najmniej jedna usterka poważna: błąd poprawności, połknięty wyjątek albo dane wrażliwe w kodzie.

## Format odpowiedzi

```
### Kryteria
1. Poprawność — <ocena + uzasadnienie w jednym zdaniu>
2. Połknięty błąd — <...>
3. Czytelność — <...>
4. Dyscyplina zakresu — <...>
5. Ryzyko danych — <...>

### Usterki
- <plik:linia> — <co jest nie tak> — <dlaczego to problem>

### Werdykt
<APPROVED | NEEDS ATTENTION | REJECTED>
```

Jeśli usterek nie ma, sekcję **Usterki** zostaw pustą i napisz w niej `brak`. Nie dopisuj uwag na siłę, żeby wyglądało na dokładne.
