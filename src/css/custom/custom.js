// im too lazy to write any comments OKAY?!?!? - noxygalaxy
function relocatePlaytime() {
    const friendListContent = document.querySelector('.friends_that_play_content');
    if (!friendListContent) return;

    const firstFriendBlockSection = friendListContent.querySelector('.profile_friends.responsive_friendblocks');
    if (!firstFriendBlockSection) return;

    const myStatsBlock = firstFriendBlockSection.querySelector('.friendBlock.persona');
    if (!myStatsBlock) return;

    const mySmallText = myStatsBlock.querySelector('.friendSmallText');
    if (!mySmallText) return;

    const headerTextContainer = document.querySelector('.profile_small_header_text');
    const locationArrow = document.querySelector('.profile_small_header_arrow');
    const locationText = document.querySelector('.profile_small_header_location');
    
    if (!headerTextContainer) return;

    const clonedStats = mySmallText.cloneNode(true);

    clonedStats.style.marginTop = '4px';
    clonedStats.style.color = '#8e8e8e';
    clonedStats.style.fontSize = '14px';
    clonedStats.style.display = 'flex';
    clonedStats.style.alignItems = 'center';
    clonedStats.style.gap = '8px';

    if (locationArrow) locationArrow.style.display = 'none';

    if (locationText && locationText.parentElement) {
        locationText.parentElement.style.display = 'none';
    }

    if (!headerTextContainer.querySelector('.friendSmallText')) {
        headerTextContainer.appendChild(clonedStats);
    }
    
    const firstHeader = friendListContent.querySelector('.mainSectionHeader');
    if (firstHeader && firstHeader.textContent.includes('Your own playtime')) {
        firstHeader.style.display = 'none';
    }
    if (firstFriendBlockSection) {
        firstFriendBlockSection.style.display = 'none';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", relocatePlaytime);
} else {
    relocatePlaytime();
}