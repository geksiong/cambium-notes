# Pandoc syntax fixture

[L]{.dropcap}ibroMorph indexes [Pandoc]{.index entry="Pandoc"} and
[Albert Einstein]{.index entry="Einstein, Albert"} with nested
[outer **bold** [inner]{.c}]{#o .e k='v'} spans and an anchor []{#anchor}.
Ruby {漢字|かんじ}, [未だ]{ruby="まだ"} and {tcy:42} stay text. {index: "Special Relativity"}

Inline $|\psi\rangle$ and $\Delta x \, \Delta p \ge \frac{\hbar}{2}$ with
$[\hat{x}, \hat{p}] = i\hbar$, inside a span [$a_1$]{.m}, but
prices $20 and $30 stay text, as do $ spaced$, \$escaped$ and \$$y$$.

$$\int_{-\infty}^{+\infty} e^{-a x^2} \, dx = \sqrt{\frac{\pi}{a}} \quad (a > 0)$$

$$
\begin{aligned}
a &= b \\
c &= d % comment
\end{aligned}
$$

> Quoted $$x_1 +
> x_2$$ math.

See [[Some Note]] and [[folder/Other|alias]] for more.

::: note
**Quick Start:** a note with $E = mc^2$:

```bash
:::
echo not a fence
```
:::

:::: {.quiz #q1 title="Check"} ::::
**Question:** Which?

- [ ] Classical bit
- [x] Qubit

::: tip
Nested div.
:::

*Explanation:* A qubit.
::::

| Feature | EPUB 3 | Web |
|:--------|:------:|----:|
| Ruby    | `<ruby>` | yes |
| Math    | MathML | MathJax |

1. One [x]{.index}
2. Two
