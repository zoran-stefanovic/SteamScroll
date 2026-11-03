<p align="center">
  <img src="docs/images/game-scroller-logo.png" alt="Game Scroller logo" width="112">
</p>

<h1 align="center">Game Scroller</h1>
<p align="center">Turn. Choose. Play.</p>
<p align="center">Browse your installed games with a Stream Deck + dial.</p>

![Game Scroller on Stream Deck +](docs/images/game-scroller-dial.png)

Game Scroller, formerly **SteamScroll**, puts your installed games on the dial. Turn to choose a game, then press to launch it through its launcher.

> **3.1 preview:** the visuals and multi-launcher features below show the upcoming Game Scroller 3.1 update. This update has been tested locally and is not yet available as a public release. The source on the default branch and existing downloads still represent the earlier SteamScroll version.

## One dial, your libraries

The new **Game Scroller** action brings **Steam**, **Epic Games** and **Battle.net** together. Select all three, any combination, or just one launcher. Each dial keeps its own selection, collection and scroll direction.

- **Automatic Steam detection:** Steam's registered installation and library folders are found automatically, including libraries on other drives.
- **Local discovery:** Epic and Battle.net games are read from local installation records.
- **Progressive icons:** browse the library while game icons load in the background.
- **Launch feedback:** a loading animation appears while the launch request is sent.

## Choose your libraries

Select the launchers to show, refresh the library, or reverse the scroll direction. Steam type filters apply only to Steam games, tools and applications. An optional Steam-folder fallback is available under Advanced.

<p align="center">
  <img src="docs/images/game-scroller-settings.png" alt="Game Scroller settings: launcher selection, reverse scrolling, Steam type filters and collections" width="480">
</p>

## Keep your favorites together

Create a collection containing games from different launchers. A dial shows games that match both its selected libraries and its chosen collection.

<p align="center">
  <img src="docs/images/game-scroller-collections.png" alt="A shared collection with games from Steam, Epic Games and Battle.net" width="480">
</p>

<sub>Settings previews use an example collection. The device visual is a promotional mock-up based on the real device.</sub>

## Launcher support

Games must be installed locally. Launchers handle sign-in, updates and any required prompts. Battle.net launch codes are supported on a best-effort basis; sending a request does not guarantee that a game has finished starting. No account credentials are collected by Game Scroller.

The 3.1 update requires **Windows 10 or later**, **Stream Deck 6.9 or later** and a **Stream Deck +**.

## Downloads

The existing public release is still listed under **SteamScroll**. It does not include the multi-launcher features shown in the 3.1 preview above.

- [Elgato Marketplace — existing SteamScroll release](https://marketplace.elgato.com/product/steamscroll-fac3f57d-db4b-4fbc-9131-a82a688c8036)
- [GitHub releases](https://github.com/zoran-stefanovic/SteamScroll/releases)

Download the `.streamDeckPlugin` package for the version you want, then double-click it to install it in Stream Deck.

## Feedback

[Report a problem or request a feature](https://github.com/zoran-stefanovic/SteamScroll/issues).
